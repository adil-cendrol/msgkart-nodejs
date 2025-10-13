// browserHandler.mjs
import { finalizeSDP } from "../utils/peerUtils.mjs";
import { getConnection } from "./connectionManager.mjs";

export async function handleBrowserConnection(browserWs, activemetaWsGetter) {
  console.log("🌐 Browser connected");
  const { pc, candidates } = await createPeerConnection("sendrecv");
  setBrowserConnection(browserWs, pc)
  const { activeMetaPC } = getConnections();

  browserWs.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    // 3️⃣ Browser sends answer
    if (data.event_type === "answer_for_browser") {
      const uuid = data.internalCallId;
      const conn = getConnection(uuid);
      if (!conn?.browserPC) return;

      await conn.browserPC.setRemoteDescription({
        type: "answer",
        sdp: data.sdp,
      });
      console.log(`✅ Browser connected for ${uuid} — audio bridged both ways`);
    }
    if (data.sdpType === "offer") {
      const { pc, candidates } = await createPeerConnection("sendrecv");
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const activeMetaWs = activeMetaWsGetter();
      if (activeMetaPC) {
        console.log("inside offer")
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
    if (data.sdpType === "answer") {
      const { activeMetaPC, activeMetaWs } = getConnections();
      if (!activeMetaPC || !activeMetaWs) {
        console.warn("⚠️ Meta PC or WebSocket not available yet");
        return;
      }
      try {
        // console.log("📨 Browser sent an answer to Backend", data.sdp);
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


  browserWs.on("close", () => console.log("Browser WS closed"));
}
