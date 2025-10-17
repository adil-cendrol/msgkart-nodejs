import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall
} from "./connectionManager.mjs";

import { metaReady, stopRecording } from "../audio/audioMixer.mjs";

export async function handleMetaConnection(response) {
  const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;
  let callConn = getCallConnection(msgkartCallId);
  if (!callConn?.metaPC) {
    const pcObj = await createPeerConnection("sendrecv");
    const metaPC = pcObj.pc;
    const metaCandidates = pcObj.candidates;
    createMetaConnection(msgkartCallId, metaPC, metaCandidates);
    callConn = getCallConnection(msgkartCallId);

    if (metaPC.ontrack !== undefined) {
      metaPC.ontrack = (ev) => {
        const track = ev.track;
        const agentConn = getAgentConnection(agentId);
        if (track.kind === "audio" && agentConn?.browserPC) {
          try {
            agentConn.browserPC.addTrack(track);
            metaReady(msgkartCallId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${msgkartCallId}, agent ${agentId})`);
          } catch (err) {
            console.warn("bridge meta->browser failed:", err?.message || err);
          }
        }
      };
    }
  }

  const metaPC = getCallConnection(msgkartCallId)?.metaPC;
  const metaCandidates = getCallConnection(msgkartCallId)?.metaCandidates;

  if (event === "request_meta_offer_sdp") {
    const offer = await metaPC.createOffer();
    await metaPC.setLocalDescription(offer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { msgkartCallId, sdp: finalSDP, SdpType: "offer", SubscriberId, BusinessId };
  }

  if (event === "meta_answer_sdp") {
    await metaPC.setRemoteDescription({ type: "answer", sdp });
    if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId); // 🔥 Auto link
    console.log(`✅ Meta PC remote description set for call ${msgkartCallId}`);
    return { status: "meta_answer_set" };
  }


  // For incomming call

  // 📞 INCOMING CALL HANDLING
  if (event === "incommingcall") {
    console.log(`📲 Incoming call from Meta for call ${msgkartCallId}, agent ${agentId}`);

    // 1️⃣ Set remote SDP (Meta → offer)
    await metaPC.setRemoteDescription({ type: "offer", sdp });

    // 2️⃣ Get or create Browser PC for agent
    let agentConn = getAgentConnection(agentId);
    if (!agentConn?.browserPC) {
      const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
      createBrowserConnection(agentId, browserPC, browserCandidates);
      agentConn = getAgentConnection(agentId);
      console.log(`🆕 Created new browserPC for agent ${agentId}`);
    }

    const browserPC = agentConn.browserPC;
    const browserCandidates = agentConn.browserCandidates;

    // 3️⃣ Bridge Tracks (audio)
    metaPC.ontrack = (ev) => {
      if (ev.track.kind === "audio") {
        try {
          browserPC.addTrack(ev.track);
          metaReady(msgkartCallId, ev.track);
          console.log(`🔊 Meta → Browser audio bridged for call ${msgkartCallId}`);
        } catch (err) {
          console.warn("⚠️ Failed to bridge Meta → Browser:", err?.message);
        }
      }
    };

    browserPC.ontrack = (ev) => {
      if (ev.track.kind === "audio") {
        try {
          metaPC.addTrack(ev.track);
          console.log(`🎤 Browser → Meta audio bridged for agent ${agentId}`);
        } catch (err) {
          console.warn("⚠️ Failed to bridge Browser → Meta:", err?.message);
        }
      }
    };

    // 4️⃣ Map agent ↔ call
    mapAgentToCall(agentId, msgkartCallId);

    // 5️⃣ Create Offer for Browser
    const browserOffer = await browserPC.createOffer();
    await browserPC.setLocalDescription(browserOffer);
    const finalSDP = finalizeSDP(browserPC, browserCandidates);

    console.log(`✅ Sending browser offer for incoming call ${msgkartCallId}`);
    return { msgkartCallId, sdp: finalSDP, SdpType: "offer", agentId, SubscriberId, BusinessId };
  }
  if (event === "browserAnswer") {
    const agentConn = getAgentConnection(agentId);
    const browserPC = agentConn?.browserPC;
    if (!browserPC) return { status: "no_browser_pc" };

    // 1️⃣ Set browser's answer on backend
    await browserPC.setRemoteDescription({ type: "answer", sdp });

    // 2️⃣ Create Meta answer for telephony
    const answer = await metaPC.createAnswer();
    await metaPC.setLocalDescription(answer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);

    console.log(`✅ Browser answer set → returning Meta answer for ${msgkartCallId}`);
    return { msgkartCallId, sdp: finalSDP, SdpType: "answer", SubscriberId, BusinessId };
  }


  if (event === "metaTerminate") {
    await stopRecording(msgkartCallId, presignedUrl);
    removeCallConnection(msgkartCallId);
    console.log(`🛑 Call ${msgkartCallId} ended and uploaded`);
    return { status: `call_disconnected ${msgkartCallId} and ${SubscriberId}` };
  }

  return { status: `no event type match` };
}
