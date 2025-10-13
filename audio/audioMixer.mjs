import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import path from "path";

// Stores per-call recording state
const recordings = new Map(); // callId -> { browserStream, metaStream, opusBrowser, opusMeta, wavWriter, buffers, output }

export function browserReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  const rec = recordings.get(callId);
  rec.browserStream = track;
  tryStartRecording(callId);
}

export function metaReady(callId, track) {
  if (!recordings.has(callId)) recordings.set(callId, {});
  const rec = recordings.get(callId);
  rec.metaStream = track;
  tryStartRecording(callId);
}

function tryStartRecording(callId) {
  const rec = recordings.get(callId);
  if (rec.isRecordingStarted) return;
  if (!rec.browserStream || !rec.metaStream) return;

  console.log(`🎙️ Both audio streams ready for call ${callId}, starting recording...`);

  rec.opusBrowser = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
  rec.opusMeta = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

  const recordingsDir = path.join(process.cwd(), "recordings");
  if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

  const wavPath = path.join(recordingsDir, `mixed_audio_${callId}_${Date.now()}.wav`);
  rec.wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
  const output = fs.createWriteStream(wavPath);
  rec.wavWriter.pipe(output);

  rec.browserBuffer = [];
  rec.metaBuffer = [];

  function mixAndWrite() {
    while (rec.browserBuffer.length && rec.metaBuffer.length) {
      const b = rec.browserBuffer.shift();
      const m = rec.metaBuffer.shift();
      const minLen = Math.min(b.length, m.length);
      const mixed = Buffer.alloc(minLen);

      for (let i = 0; i < minLen; i += 2) {
        const bSample = b.readInt16LE(i);
        const mSample = m.readInt16LE(i);
        let mixedSample = bSample + mSample;
        mixedSample = Math.max(-32768, Math.min(32767, mixedSample));
        mixed.writeInt16LE(mixedSample, i);
      }
      rec.wavWriter.write(mixed);
    }
  }

  rec.opusBrowser.on("data", (pcm) => {
    rec.browserBuffer.push(pcm);
    mixAndWrite();
  });

  rec.opusMeta.on("data", (pcm) => {
    rec.metaBuffer.push(pcm);
    mixAndWrite();
  });

  rec.browserStream.onReceiveRtp.subscribe((rtp) => rec.opusBrowser.write(rtp.payload));
  rec.metaStream.onReceiveRtp.subscribe((rtp) => rec.opusMeta.write(rtp.payload));

  rec.isRecordingStarted = true;
  console.log(`🔴 Recording started for call ${callId}: ${wavPath}`);
  rec.wavPath = wavPath;
}

export function stopRecording(callId) {
  const rec = recordings.get(callId);
  if (!rec || !rec.isRecordingStarted) return;

  console.log(`🛑 Stopping recording for call ${callId}...`);
  rec.opusBrowser.end();
  rec.opusMeta.end();
  rec.wavWriter.end();

  // Clean up
  recordings.delete(callId);
  console.log(`✅ Recording finished for call ${callId}`);
}
