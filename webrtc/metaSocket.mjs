import { v4 as uuidv4 } from "uuid";
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  createBrowserConnection,
  getConnection,
  setMetaConnection,
} from "./connectionManager.mjs";

export async function handleMetaConnection(metaWs, activeBrowserWsGetter) {
  const { pc, candidates } = await createPeerConnection("sendrecv");
  setMetaConnection(metaWs, pc);

  metaWs.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());
    // 1️⃣ Meta asks for offer
    // Promotion by call initate
    if (data.event_type === "createOffer") {
      const uuid = uuidv4();
      const { pc: metaPC, candidates } = await createPeerConnection("sendrecv");
      createMetaConnection(uuid, metaWs, metaPC);

      metaPC.onTrack.subscribe((track) => {
        const conn = getConnection(uuid);
        if (track.kind === "audio" && conn.browserPC) {
          console.log(`🎤 Meta audio → Browser for ${uuid}`);
          conn.browserPC.addTrack(track);
        }
      });

      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      const finalSDP = finalizeSDP(metaPC, candidates);
      console.log(finalSDP, "Adil ", uuid)

      metaWs.send(
        JSON.stringify({
          event_type: "offer",
          internalCallId: uuid,
          sdp: finalSDP,
        })
      );
    }

    // 2️⃣ Meta sends answer
    if (data.event_type === "answer") {
      const uuid = data.internalCallId;
      const conn = getConnection(uuid);
      if (!conn?.metaPC) return;

      await conn.metaPC.setRemoteDescription({
        type: "answer",
        sdp: data.sdp || "",
      });
      console.log(`✅ Meta connected for ${uuid}`);

      // 3️⃣ Now create Browser offer for same UUID
      const activeBrowserWs = activeBrowserWsGetter();
      if (!activeBrowserWs) {
        console.warn("⚠️ No browser WS connected");
        return;
      }

      const { pc: browserPC, candidates: browserCandidates } =
        await createPeerConnection("sendrecv");
      createBrowserConnection(uuid, activeBrowserWs, browserPC);

      browserPC.onTrack.subscribe((track) => {
        if (track.kind === "audio" && conn.metaPC) {
          console.log(`🎤 Browser audio → Meta for ${uuid}`);
          conn.metaPC.addTrack(track);
        }
      });

      const offer = await browserPC.createOffer();
      await browserPC.setLocalDescription(offer);
      const finalBrowserSDP = finalizeSDP(browserPC, browserCandidates);

      activeBrowserWs.send(
        JSON.stringify({
          event_type: "offer_for_browser",
          internalCallId: uuid,
          sdp: finalBrowserSDP,
        })
      );
      console.log(`📤 Sent browser offer for ${uuid}`);
    }
    // end
    //secodn call
    if (data.event_type === "secondformanswer") {
      // if (data.sdpType === "answer") {
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
      // }
    }
    if (data.sdpType === "offer") {
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


  });
  

  metaWs.on("close", () => console.log("Meta WS closed"));
}
