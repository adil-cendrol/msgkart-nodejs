// handleMetaConnection.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall,
  listAgentIds,
  agentToCall,
  getCallIdByAgent,
  getAgentIdByCall
} from "./connectionManager.mjs";
import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs";

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
    if (!metaPC._ontrackSet) {
      metaPC._ontrackSet = true;
      metaPC.ontrack = (ev) => {
        try {
          const track = ev.track;
          // Find the agent mapped to this call
          const agentIdForCall = [...agentToCall.entries()]
            .find(([agentId, cId]) => cId === msgkartCallId)?.[0];

          if (!agentIdForCall) {
            console.warn(`⚠️ No agent mapped yet for call ${msgkartCallId}.`);
            return;
          }
          const agentConn = getAgentConnection(agentIdForCall);
          if (!agentConn?.browserPC) return;
          const browserPC = agentConn.browserPC;
          // Prevent adding the same track again
          const alreadyAdded = browserPC.getSenders().some(s => s.track === track);
          if (!alreadyAdded && track.kind === "audio") {
            console.log("🎤 Forwarding audio track to Browser");
            browserPC.addTrack(track);
            metaReady(msgkartCallId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${msgkartCallId}, agent ${agentIdForCall})`);
            // track.onReceiveRtp.subscribe((rtp) => {
            //   console.log("📥 RTP from meta:", rtp.header.timestamp)
            // });
          } else {
            console.warn(`⚠️ Track already added or invalid for agent ${agentIdForCall}`);
          }
        } catch (err) {
          console.error(`❌ Error in metaPC ontrack for call ${msgkartCallId}:`, err);
        }
      };
    }


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

      // Use the agentId from the request body, not from mapping
      const agentIdForCall = agentId || getAgentIdByCall(msgkartCallId);

      console.log(`🔍 Agent for call ${msgkartCallId} is ${agentIdForCall}`);

      await metaPC.setRemoteDescription({ type: "answer", sdp });

      // Bridge audio if we have an agent
      if (agentIdForCall) {
        await bridgeAudioBetweenPeerConnections(agentIdForCall, msgkartCallId);
      } else {
        console.warn(`⚠️ No agent found for call ${msgkartCallId}, audio bridging skipped`);
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
    const browserTracks = browserPC.getTransceivers()
      .filter(transceiver => transceiver.receiver.track)
      .map(transceiver => transceiver.receiver.track);

    browserTracks.forEach(track => {
      if (track.kind === "audio") {
        if (!metaPC.getTransceivers().some(t => t.receiver.track === track)) {
          metaPC.addTrack(track);
          browserReady(callId, track);
          console.log(`🎤 Forwarding browser audio to meta for call ${callId}`);
        }
      }
    });
    console.log(`✅ Audio bridge established between agent ${agentId} and call ${callId}`);
  } catch (err) {
    console.error(`❌ Error bridging audio:`, err);
  }
}