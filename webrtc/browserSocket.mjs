import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import { browserReady, stopRecording } from "../audio/audioMixer.mjs";
// import { getConnections } from "./connectionManager.js";
import { getConnections, setBrowserConnection } from "./connectionManager.mjs";

export async function handleBrowserConnection(ws) {
  console.log("📡 Browser connected");
  const { pc, candidates } = await createPeerConnection("sendrecv");
  setBrowserConnection(ws, pc)
  const { activeBrowserWs, activeMetaWs, activeBrowserPC, activeMetaPC } = getConnections();

  ws.on("close", () => {
    console.log("Browser disconnected");
    stopRecording();
  });

  pc.onTrack.subscribe(track => {
    const { activeMetaPC } = getConnections();
    if (track.kind === "audio") {
      console.log("🎤 Forwarding Browser audio to Meta");
      activeMetaPC.addTrack(track);
      browserReady(track)
    }
    track.onReceiveRtp.subscribe((rtp) => {
      console.log("📥 RTP from browser side:", rtp.header.timestamp)
    });
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.sdpType === "offer") {
      console.log("📨 Browser offer received isnide ");
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      if (activeMetaWs && activeMetaPC) {
        const offer = await activeMetaPC.createOffer();
        await activeMetaPC.setLocalDescription(offer);
        const metaSDP = finalizeSDP(activeMetaPC, candidates);
        const offerPayload = {
          AgentChatEventType: "call",
          businessId: "564cbdc4a1c848f5951f0930e4e9aced",
          FromPhoneId: "645598385313872",
          ToNumber: "919625534956",
          sdpType: "offer",
          sdp: metaSDP,
          callEvent: "connect",
        };
        console.log("📤 Forwarding offer payload to Meta AWS:", offerPayload);
        activeMetaWs.send(JSON.stringify(offerPayload));
      }
      else {
        console.warn("❌ No Meta connected yet!");
      }
    }
    else if (data.sdpType === "answer") {
      const { activeMetaPC, activeMetaWs } = getConnections();
      if (!activeMetaPC || !activeMetaWs) {
        console.warn("⚠️ Meta PC or WebSocket not available yet");
        return;
      }
      try {
        const { activeBrowserWs, activeMetaWs, activeBrowserPC, activeMetaPC } = getConnections();
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        const answer = await activeMetaPC.createAnswer();
        await activeMetaPC.setLocalDescription(answer);
        const metaSDP = finalizeSDP(activeMetaPC, candidates);
        data.sdp = metaSDP;
        console.log(data, "sending to meta")
        activeMetaWs.send(JSON.stringify(data));
        console.log("📤 Forwarded answer to Meta with updated SDP");
      } catch (err) {
        console.error("❌ Failed to process answer for Meta:", err);
      }
    }

  });
}
