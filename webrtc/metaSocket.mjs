// handleMetaConnection.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall,
  agentToCall
} from "./connectionManager.mjs";
import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs";

/**
 * Handles Meta-side WebRTC connections and audio bridging
 * with already connected Browser PC. No renegotiation required.
 */
export async function handleMetaConnection(response) {
  try {
    const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;

    // 1️⃣ Get or create Meta PC
    let callConn = getCallConnection(msgkartCallId);
    if (!callConn?.metaPC) {
      const { pc, candidates } = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pc, candidates);
      callConn = getCallConnection(msgkartCallId);
      console.log(`🧩 Created new metaPC for call ${msgkartCallId}`);
    }

    const metaPC = callConn.metaPC;

    // 2️⃣ Attach Meta → Browser track bridging (once)
    if (!metaPC._ontrackSet) {
      metaPC._ontrackSet = true;
      metaPC.ontrack = (ev) => {
        const track = ev.track;
        const agentIdForCall = [...agentToCall.entries()].find(([aId, cId]) => cId === msgkartCallId)?.[0];
        if (!agentIdForCall) return;

        const agentConn = getAgentConnection(agentIdForCall);
        if (!agentConn?.browserPC) return;
        const browserPC = agentConn.browserPC;

        // Clone track before adding to Browser PC
        if (!browserPC.getSenders().some(s => s.track === track)) {
          const clonedTrack = track.clone();
          browserPC.addTrack(clonedTrack);
          metaReady(msgkartCallId, clonedTrack);
          console.log(`🔊 Meta → Browser bridged (call ${msgkartCallId}, agent ${agentIdForCall})`);
        }
      };
    }

    // 3️⃣ Pre-attach Browser → Meta tracks (alive tracks, clone)
    const agentIdForCall = [...agentToCall.entries()].find(([aId, cId]) => cId === msgkartCallId)?.[0];
    const agentConn = getAgentConnection(agentIdForCall);
    if (agentConn?.browserPC) {
      agentConn.browserPC.getSenders().forEach(sender => {
        const track = sender.track;
        if (track?.kind === "audio" && !metaPC.getSenders().some(s => s.track === track)) {
          const clonedTrack = track.clone();
          metaPC.addTrack(clonedTrack);
          browserReady(msgkartCallId, clonedTrack);
          console.log(`🎤 Browser → Meta bridged (alive track)`);
        }
      });
    }

    // 4️⃣ Handle Meta offer request
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      console.log(`✅ Meta offer SDP created for call ${msgkartCallId}`);
      return {
        msgkartCallId,
        sdp: finalizeSDP(metaPC, callConn.metaCandidates),
        SdpType: "offer",
        SubscriberId,
        BusinessId
      };
    }

    // 5️⃣ Handle Meta answer
    if (event === "meta_answer_sdp") {
      if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId);
      await metaPC.setRemoteDescription({ type: "answer", sdp });
      console.log(`📞 Meta answer set for call ${msgkartCallId}`);
      return { status: "meta_answer_set" };
    }

    // 6️⃣ Terminate call
    if (event === "terminate") {
      await stopRecording(msgkartCallId, presignedUrl);
      removeCallConnection(msgkartCallId);
      console.log(`🛑 Call ${msgkartCallId} ended and uploaded`);
      return { status: `call_disconnected ${msgkartCallId}` };
    }

    return { status: "no_event_type_match" };
  } catch (err) {
    console.error(`❌ Global error in handleMetaConnection:`, err);
    return { status: "fatal_error", message: err.message };
  }
}
