// audioMixer.mjs
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const recordings = new Map(); // callId => recording object
const s3UploadQueue = [];
let isUploading = false;

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function processUploadQueue() {
  if (isUploading || s3UploadQueue.length === 0) return;
  isUploading = true;
  const { callId, wavPath } = s3UploadQueue.shift();
  try {
    const fileData = fs.readFileSync(wavPath);
    const fileName = path.basename(wavPath);
    const s3Key = `call-recordings/${fileName}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fileData,
      ContentType: "audio/wav",
    }));
    console.log(`✅ Uploaded: s3://${process.env.AWS_S3_BUCKET}/${s3Key}`);
    fs.unlink(wavPath, (err) => {
      if (err) console.error(`⚠️ Delete failed: ${wavPath}`, err);
      else console.log(`🧹 Deleted local: ${wavPath}`);
    });
  } catch (err) {
    console.error(`❌ Upload failed for ${callId}:`, err);
  } finally {
    isUploading = false;
    process.nextTick(processUploadQueue);
  }
}

/**
 * Called when browser side (agent) track is ready for a call.
 * `track` must expose onReceiveRtp.subscribe((rtp) => ...)
 */
export function browserReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  recordings.get(callId).browserStream = track;
  tryStartRecording(callId);
}

/**
 * Called when meta side track is ready for a call.
 */
export function metaReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  recordings.get(callId).metaStream = track;
  tryStartRecording(callId);
}

/** Internal */
function tryStartRecording(callId) {
  const rec = recordings.get(callId);
  if (!rec) return;
  if (rec.isRecordingStarted) return;
  if (!rec.browserStream || !rec.metaStream) return;

  console.log(`🎙️ Starting recording for ${callId}...`);

  rec.opusBrowser = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
  rec.opusMeta = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

  const recordingsDir = path.join(process.cwd(), "recordings");
  if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

  const wavPath = path.join(recordingsDir, `mixed_${callId}_${Date.now()}.wav`);
  rec.wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
  const output = fs.createWriteStream(wavPath);
  rec.wavWriter.pipe(output);
  rec.wavPath = wavPath;

  rec.browserBuffer = [];
  rec.metaBuffer = [];

  const mixAndWrite = () => {
    while (rec.browserBuffer.length && rec.metaBuffer.length) {
      const b = rec.browserBuffer.shift();
      const m = rec.metaBuffer.shift();
      const minLen = Math.min(b.length, m.length);
      // Ensure even length for 16-bit samples
      const len = minLen - (minLen % 2);
      const mixed = Buffer.alloc(len);
      for (let i = 0; i < len; i += 2) {
        const sampleB = b.readInt16LE(i);
        const sampleM = m.readInt16LE(i);
        const mixedSample = Math.max(-32768, Math.min(32767, sampleB + sampleM));
        mixed.writeInt16LE(mixedSample, i);
      }
      rec.wavWriter.write(mixed);
    }
  };

  // attach decoders -> buffers
  rec.opusBrowser.on("data", (pcm) => {
    rec.browserBuffer.push(pcm);
    if (rec.browserBuffer.length > 40) rec.browserBuffer.shift();
    mixAndWrite();
  });

  rec.opusMeta.on("data", (pcm) => {
    rec.metaBuffer.push(pcm);
    if (rec.metaBuffer.length > 40) rec.metaBuffer.shift();
    mixAndWrite();
  });

  // attach incoming RTP handlers (your RTP objects)
  if (rec.browserStream?.onReceiveRtp?.subscribe) {
    rec.browserStream.onReceiveRtp.subscribe((rtp) => {
      try { rec.opusBrowser.write(rtp.payload); } catch (e) {}
    });
  } else {
    console.warn(`[audioMixer] browserStream has no onReceiveRtp (call ${callId})`);
  }

  if (rec.metaStream?.onReceiveRtp?.subscribe) {
    rec.metaStream.onReceiveRtp.subscribe((rtp) => {
      try { rec.opusMeta.write(rtp.payload); } catch (e) {}
    });
  } else {
    console.warn(`[audioMixer] metaStream has no onReceiveRtp (call ${callId})`);
  }

  rec.isRecordingStarted = true;
  console.log(`🔴 Recording started: ${wavPath}`);
}

/** Stop and queue upload */
export async function stopRecording(callId) {
  const rec = recordings.get(callId);
  if (!rec || !rec.isRecordingStarted) return;
  console.log(`🛑 Stopping recording for ${callId}`);
  try { rec.opusBrowser?.end(); } catch(e) {}
  try { rec.opusMeta?.end(); } catch(e) {}
  try { rec.wavWriter?.end(); } catch(e) {}

  const wavPath = rec.wavPath;
  recordings.delete(callId);

  if (wavPath && fs.existsSync(wavPath)) {
    s3UploadQueue.push({ callId, wavPath });
    processUploadQueue();
  }

  // cleanup buffers
  rec.browserBuffer = null;
  rec.metaBuffer = null;
  global.gc?.();
  console.log(`✅ Queued upload for ${callId}`);
}
