import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import path from "path";


let opusBrowser, opusMeta, wavWriter;
let isRecordingStarted = false;
let browserStream = null;
let metaStream = null;

export function browserReady(track) {
    browserStream = track;
    tryStartRecording();
}
export function metaReady(track) {
    metaStream = track;
    tryStartRecording();
}

// function tryStartRecording() {
//     if (isRecordingStarted || !browserStream || !metaStream) return;

//     console.log("🎙️ Both audio streams ready, starting recording...");

//     opusBrowser = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
//     opusMeta = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

//     const wavPath = `recordings/mixed_audio_${Date.now()}.wav`;
//     wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
//     const output = fs.createWriteStream(wavPath);
//     wavWriter.pipe(output);

//     const browserBuffer = [];
//     const metaBuffer = [];

//     function mixAndWrite() {
//         while (browserBuffer.length && metaBuffer.length) {
//             const b = browserBuffer.shift();
//             const m = metaBuffer.shift();
//             const minLen = Math.min(b.length, m.length);
//             const mixed = Buffer.alloc(minLen);

//             for (let i = 0; i < minLen; i += 2) {
//                 const bSample = b.readInt16LE(i);
//                 const mSample = m.readInt16LE(i);
//                 let mixedSample = bSample + mSample;
//                 mixedSample = Math.max(-32768, Math.min(32767, mixedSample));
//                 mixed.writeInt16LE(mixedSample, i);
//             }
//             wavWriter.write(mixed);
//         }
//     }

//     opusBrowser.on("data", (pcm) => {
//         browserBuffer.push(pcm);
//         mixAndWrite();
//     });
//     opusMeta.on("data", (pcm) => {
//         metaBuffer.push(pcm);
//         mixAndWrite();
//     });

//     browserStream.onReceiveRtp.subscribe((rtp) => opusBrowser.write(rtp.payload));
//     metaStream.onReceiveRtp.subscribe((rtp) => opusMeta.write(rtp.payload));

//     isRecordingStarted = true;
//     console.log("🔴 Recording started at:", wavPath);
// }

function tryStartRecording() {
    if (isRecordingStarted || !browserStream || !metaStream) return;

    console.log("🎙️ Both audio streams ready, starting recording...");

    opusBrowser = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
    opusMeta = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

    const recordingsDir = path.join(process.cwd(), "recordings");
    if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const wavPath = path.join(recordingsDir, `mixed_audio_${Date.now()}.wav`);
    wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
    const output = fs.createWriteStream(wavPath);
    wavWriter.pipe(output);

    const browserBuffer = [];
    const metaBuffer = [];

    function mixAndWrite() {
        while (browserBuffer.length && metaBuffer.length) {
            const b = browserBuffer.shift();
            const m = metaBuffer.shift();
            const minLen = Math.min(b.length, m.length);
            const mixed = Buffer.alloc(minLen);

            for (let i = 0; i < minLen; i += 2) {
                const bSample = b.readInt16LE(i);
                const mSample = m.readInt16LE(i);
                let mixedSample = bSample + mSample;
                mixedSample = Math.max(-32768, Math.min(32767, mixedSample));
                mixed.writeInt16LE(mixedSample, i);
            }
            wavWriter.write(mixed);
        }
    }

    opusBrowser.on("data", (pcm) => {
        browserBuffer.push(pcm);
        mixAndWrite();
    });
    opusMeta.on("data", (pcm) => {
        metaBuffer.push(pcm);
        mixAndWrite();
    });

    browserStream.onReceiveRtp.subscribe((rtp) => opusBrowser.write(rtp.payload));
    metaStream.onReceiveRtp.subscribe((rtp) => opusMeta.write(rtp.payload));

    isRecordingStarted = true;
    console.log("🔴 Recording started at:", wavPath);
}

export function stopRecording() {
    if (!isRecordingStarted) return;
    console.log("🛑 Stopping recording...");
    opusBrowser.end();
    opusMeta.end();
    wavWriter.end();
    isRecordingStarted = false;
    browserStream = null;
    metaStream = null;
}
