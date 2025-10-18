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
 * Handles Meta-side WebRTC connections and audio bridging.
 */
export async function handleMetaConnection(response) {
  try {
    const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;

    let callConn = getCallConnection(msgkartCallId);
    if (!callConn?.metaPC) {
      const { pc, candidates } = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pc, candidates);
      callConn = getCallConnection(msgkartCallId);
      console.log(`🧩 Created new metaPC for call ${msgkartCallId}`);
    }

    const metaPC = callConn.metaPC;

    // --- Track bridging ---
    if (!metaPC._ontrackSet) {
      metaPC._ontrackSet = true;
      metaPC.ontrack = (ev) => {
        const track = ev.track;
        const agentIdForCall = [...agentToCall.entries()].find(([aId, cId]) => cId === msgkartCallId)?.[0];
        if (!agentIdForCall) return;

        const agentConn = getAgentConnection(agentIdForCall);
        if (!agentConn?.browserPC) return;
        const browserPC = agentConn.browserPC;

        // Meta → Browser
        if (!browserPC.getSenders().some(s => s.track === track)) {
          browserPC.addTrack(track);
          metaReady(msgkartCallId, track);
          console.log("🔊 Meta → Browser bridged");
        }
      };
    }

    // --- Pre-attach Browser tracks to Meta (no renegotiation) ---
    const agentIdForCall = [...agentToCall.entries()].find(([aId, cId]) => cId === msgkartCallId)?.[0];
    const agentConn = getAgentConnection(agentIdForCall);
    if (agentConn?.browserPC) {
      agentConn.browserPC.getSenders().forEach(sender => {
        const track = sender.track;
        if (track?.kind === "audio" && !metaPC.getSenders().some(s => s.track === track)) {
          metaPC.addTrack(track);
          browserReady(msgkartCallId, track);
          track.onReceiveRtp.subscribe((rtp) => {
            console.log("📥 RTP from browser side:", rtp.header.timestamp)
          });
          console.log("🎤 Browser → Meta bridged (alive track)");
        }
      });
    }

    // --- Handle Meta offer request ---
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      console.log(`✅ Meta offer SDP created for call ${msgkartCallId}`);
      return { msgkartCallId, sdp: finalizeSDP(metaPC, callConn.metaCandidates), SdpType: "offer", SubscriberId, BusinessId };
    }

    // --- Handle Meta answer ---
    if (event === "meta_answer_sdp") {
      if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId);
      await metaPC.setRemoteDescription({ type: "answer", sdp });
      console.log(`📞 Meta answer set for call ${msgkartCallId}`);
      return { status: "meta_answer_set" };
    }

    // --- Terminate call ---
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
