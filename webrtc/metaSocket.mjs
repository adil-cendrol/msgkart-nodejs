import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import { stopRecording, metaReady } from "../audio/audioMixer.mjs";
import { setMetaConnection, getConnections } from "./connectionManager.mjs";

export async function handleMetaConnection(ws) {
  const { pc, candidates } = await createPeerConnection("sendrecv");
  const { activeBrowserWs, activeMetaWs, activeBrowserPC, activeMetaPC } = getConnections();
  setMetaConnection(ws, pc);

  ws.on("close", () => {
    console.log("Meta disconnected");
    stopRecording();
  });

  pc.onTrack.subscribe(track => {
    if (track.kind === "audio") {
      const { activeBrowserPC } = getConnections();
      if (activeBrowserPC) {
        // console.log("🎤 Forwarding audio track to Browser");
        activeBrowserPC.addTrack(track);
        metaReady(track);
      } else {
        console.warn("⚠️ Browser PeerConnection not available yet, cannot forward audio track");
      }
    }
    track.onReceiveRtp.subscribe((rtp) => {
      console.log("📥 RTP from meta:", rtp.header.timestamp)
    });
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.sdpType === "offer") {
      // console.log("📨 Meta sent an offer to Backend:", data);
      // const { candidates } = await createPeerConnection("sendrecv");
      const { activeBrowserPC, activeBrowserWs } = getConnections();
      if (!activeBrowserPC || !activeBrowserWs) {
        console.warn("⚠️ Browser PC or WebSocket not ready yet");
        return;
      }
      try {
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        console.log("✅ Backend (Meta PC) set remote description successfully");
      } catch (err) {
        console.error("❌ Failed to set remote description on Meta PC:", err);
        return;
      }
      try {
        const browserOffer = await activeBrowserPC.createOffer();
        console.log(browserOffer, "my browser offfer")
        await activeBrowserPC.setLocalDescription(browserOffer);
        const finalSDP = finalizeSDP(activeBrowserPC, candidates);
        data.sdp = finalSDP;
        activeBrowserWs.send(JSON.stringify(data));
        console.log("📤 Forwarded Meta offer to Browser with updated SDP");
      } catch (err) {
        console.error("❌ Failed to create/send offer to Browser:", err);
      }
    }

    if (data.sdpType === "answer") {
      console.log("📨 Meta sent an answer to Backend");
      const { activeBrowserPC, activeBrowserWs } = getConnections();
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        console.log("✅ Backend (Meta PC) set remote description successfully");
      } catch (err) {
        console.error("❌ Failed to set remote description on Meta PC:", err);
      }
      if (activeBrowserPC && activeBrowserWs) {
        try {
          console.log("🔄 Creating answer for Browser PeerConnection");
          const browserAnswer = await activeBrowserPC.createAnswer();
          await activeBrowserPC.setLocalDescription(browserAnswer);

          const finalSDP = finalizeSDP(activeBrowserPC, candidates);
          activeBrowserWs.send(JSON.stringify({ type: "answer", sdp: finalSDP }));
          console.log("📤 Sent answer SDP to Browser successfully");
        } catch (err) {
          console.error("❌ Failed to create/send answer to Browser:", err);
        }
      } else {
        console.warn("⚠️ Browser PeerConnection or WebSocket not available yet");
      }
    }

  });
}
