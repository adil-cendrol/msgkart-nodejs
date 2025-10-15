// import { stopRecording } from "../audio/audioMixer.mjs";
// import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
// import { getConnection, createBrowserConnection, setBrowserConnection, removeConnection } from "./connectionManager.mjs";

// export async function handleBrowserConnection(browserWs) {
//   console.log("🌐 Browser connected");
//   const { pc, candidates } = await createPeerConnection("sendrecv");
//   setBrowserConnection(browserWs, pc);

//   browserWs.on("message", async msg => {
//     const data = JSON.parse(msg.toString());
//     const uuid = data.internalCallId;
//     const conn = getConnection(uuid);
//     if (!conn) return;

//     // Browser answer
//     if (data.event_type === "answer_for_browser") {
//       await conn.browserPC.setRemoteDescription({ type: "answer", sdp: data.sdp });
//       console.log(`✅ Browser answer set for ${uuid}`);
//     }
//     if (eventType === "call_ended") {
//       removeConnection(callId);
//       stopRecording(callId)
//       return { status: "call_disconnected" };
//     }
    

//   });

//   browserWs.on("close", () => console.log("Browser WS closed"));
// }
