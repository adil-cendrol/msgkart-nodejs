// handleMetaConnection.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall,
  listAgentIds,
  agentToCall
} from "./connectionManager.mjs";
import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs";

/**
 * Handles Meta-side WebRTC connections, SDP exchange, and audio bridging
 * between Meta PC and browser PC for agents.
 */
export async function handleMetaConnection(response) {
  try {
    const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;

    // 1️⃣ Get or create Meta PC
    let callConn = getCallConnection(msgkartCallId);
    if (!callConn?.metaPC) {
      const pcObj = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pcObj.pc, pcObj.candidates);
      callConn = getCallConnection(msgkartCallId);
      console.log(`🧩 Created new metaPC for call ${msgkartCallId}`);
    }

    const metaPC = callConn.metaPC;
    const metaCandidates = callConn.metaCandidates;

    // 2️⃣ Map agent to call immediately if agentId is provided
    if (agentId && msgkartCallId) {
      mapAgentToCall(agentId, msgkartCallId);
      console.log(`🔗 Mapped agent ${agentId} to call ${msgkartCallId}`);
    }

    // 3️⃣ Handle Meta SDP offer request
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      const finalSDP = finalizeSDP(metaPC, metaCandidates);

      console.log("📤 Meta offer SDP created");
      return {
        msgkartCallId,
        sdp: finalSDP,
        SdpType: "offer",
        SubscriberId,
        BusinessId
      };
    }

    // 4️⃣ Handle Meta SDP answer - Set up audio bridging here
    if (event === "meta_answer_sdp") {
      console.log(`📞 Setting Meta answer SDP for call ${msgkartCallId}`);
      await metaPC.setRemoteDescription({ type: "answer", sdp });

      // Find the agent mapped to this call and bridge audio
      const agentIdForCall = getCallIdByAgent(msgkartCallId);
      if (agentIdForCall) {
        await bridgeAudioBetweenPeerConnections(agentIdForCall, msgkartCallId);
      }

      return { status: "meta_answer_set" };
    }

    // 5️⃣ Terminate call
    if (event === "terminate") {
      await stopRecording(msgkartCallId, presignedUrl);
      removeCallConnection(msgkartCallId);
      console.log(`🛑 Call ${msgkartCallId} ended and uploaded`);
      return { status: `call_disconnected ${msgkartCallId} and ${SubscriberId}` };
    }

    return { status: "no event type match" };
  } catch (err) {
    console.error(`❌ Global error in handleMetaConnection:`, err);
    return { status: "fatal_error", message: err.message };
  }
}

// Add this function to bridge audio between browser and meta
async function bridgeAudioBetweenPeerConnections(agentId, callId) {
  try {
    const agentConn = getAgentConnection(agentId);
    const callConn = getCallConnection(callId);

    if (!agentConn || !callConn) {
      console.warn(`⚠️ Cannot bridge: agent ${agentId} or call ${callId} not found`);
      return;
    }

    const browserPC = agentConn.browserPC;
    const metaPC = callConn.metaPC;

    console.log(`🔊 Bridging audio between agent ${agentId} and call ${callId}`);

    // Forward browser audio tracks to meta
    browserPC.getSenders().forEach(sender => {
      const track = sender.track;
      if (track && track.kind === "audio") {
        if (!metaPC.getSenders().some(s => s.track === track)) {
          metaPC.addTrack(track);
          console.log(`🎤 Forwarding browser audio to meta for call ${callId}`);
        }
      }
    });

    // Forward meta audio tracks to browser
    metaPC.ontrack = (ev) => {
      const track = ev.track;
      if (track.kind === "audio") {
        if (!browserPC.getSenders().some(s => s.track === track)) {
          browserPC.addTrack(track);
          console.log(`🎧 Forwarding meta audio to browser for agent ${agentId}`);
        }
      }
    };

    console.log(`✅ Audio bridge established between agent ${agentId} and call ${callId}`);
  } catch (err) {
    console.error(`❌ Error bridging audio:`, err);
  }
}