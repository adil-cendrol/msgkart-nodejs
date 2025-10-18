import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import path from "path";
import axios from "axios";

const recordings = new Map(); // callId => recording object

/** Called when browser side (agent) track is ready */
export function browserReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  recordings.get(callId).browserStream = track;
  tryStartRecording(callId);
}

/** Called when meta side track is ready */
export function metaReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  recordings.get(callId).metaStream = track;
  tryStartRecording(callId);
}

/** Internal: Start recording when both streams are ready */
function tryStartRecording(callId) {
  const rec = recordings.get(callId);
  if (!rec || rec.isRecordingStarted) return;
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

  if (rec.browserStream?.onReceiveRtp?.subscribe) {
    rec.browserStream.onReceiveRtp.subscribe((rtp) => rec.opusBrowser.write(rtp.payload));
  }
  if (rec.metaStream?.onReceiveRtp?.subscribe) {
    rec.metaStream.onReceiveRtp.subscribe((rtp) => rec.opusMeta.write(rtp.payload));
  }

  rec.isRecordingStarted = true;
  console.log(`🔴 Recording started: ${wavPath}`);
}

/** Stop recording and optionally upload to presigned URL */
export async function stopRecording(callId, presignedUrl) {
  const rec = recordings.get(callId);
  if (!rec || !rec.isRecordingStarted) return;
  console.log(`🛑 Stopping recording for ${callId}`);

  try { rec.opusBrowser?.end(); } catch { }
  try { rec.opusMeta?.end(); } catch { }
  try { rec.wavWriter?.end(); } catch { }

  const wavPath = rec.wavPath;
  recordings.delete(callId);

  try {
    if (wavPath && fs.existsSync(wavPath)) {
      if (presignedUrl) {
        try {
          const fileData = fs.readFileSync(wavPath);
          await axios.put(presignedUrl, fileData);
          console.log(`✅ Uploaded recording to presigned URL`);
        } catch (uploadErr) {
          console.error(`❌ Upload failed for ${callId}:`, uploadErr.message);
        }
      }

      // Always delete local file after upload (or even if upload failed)
      try {
        fs.unlinkSync(wavPath);
        console.log(`🧹 Deleted local recording file: ${wavPath}`);
      } catch (delErr) {
        console.error(`⚠️ Failed to delete local file: ${delErr.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error cleaning up recording for ${callId}:`, err);
  }

  rec.browserBuffer = null;
  rec.metaBuffer = null;
  global.gc?.();
}
