// handleMetaConnection.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall,
  agentToCall,
  getAgentIdByCall,
  resetBrowserPCForNewCall
} from "./connectionManager.mjs";
import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs";
import { MediaStream } from "werift";

export async function handleMetaConnection(response) {
  try {
    const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;

    // 1️⃣ Get or create Meta PC
    let callConn = getCallConnection(msgkartCallId);
    let isNewMetaPC = false;
    
    if (!callConn?.metaPC) {
      const pcObj = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pcObj.pc, pcObj.candidates);
      callConn = getCallConnection(msgkartCallId);
      callConn.metaPC._ontrackSet = false;
      isNewMetaPC = true;
      console.log(`🧩 Created new metaPC for call ${msgkartCallId}`);
    }

    const metaPC = callConn.metaPC;
    const metaCandidates = callConn.metaCandidates;

    // 2️⃣ Set up ontrack handler for NEW MetaPC instances
    if (isNewMetaPC || !metaPC._ontrackSet) {
      metaPC._ontrackSet = true;
      
      metaPC.ontrack = (ev) => {
        try {
          const track = ev.track;
          if (track.kind !== "audio") return;

          console.log(`🎯 MetaPC ontrack FIRED for call ${msgkartCallId}, track: ${track.id}`);

          // Find agent for this call - try multiple approaches
          let agentIdForCall = agentId || getAgentIdByCall(msgkartCallId);
          
          if (!agentIdForCall) {
            // If no mapping yet, try to find recently mapped agent
            console.log(`🔍 Searching for agent mapping for call ${msgkartCallId}...`);
            agentIdForCall = [...agentToCall.entries()]
              .find(([aId, cId]) => cId === msgkartCallId)?.[0];
          }

          if (!agentIdForCall) {
            console.warn(`⚠️ No agent mapped yet for call ${msgkartCallId}. Will retry...`);
            // Schedule retry after a short delay
            setTimeout(() => {
              const retryAgentId = getAgentIdByCall(msgkartCallId);
              if (retryAgentId) {
                console.log(`🔄 Retry: Found agent ${retryAgentId} for call ${msgkartCallId}`);
                bridgeMetaTrackToBrowser(track, retryAgentId, msgkartCallId);
              }
            }, 500);
            return;
          }

          bridgeMetaTrackToBrowser(track, agentIdForCall, msgkartCallId);
          
        } catch (err) {
          console.error(`❌ Error in metaPC ontrack for call ${msgkartCallId}:`, err);
        }
      };
      
      console.log(`🎧 Ontrack handler set for MetaPC (call ${msgkartCallId})`);
    }

    // 3️⃣ Map agent to call immediately if agentId is provided
    if (agentId && msgkartCallId) {
      mapAgentToCall(agentId, msgkartCallId);
      console.log(`🔗 Mapped agent ${agentId} to call ${msgkartCallId}`);
    }

    // 4️⃣ Handle Meta SDP offer request
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

    // 5️⃣ Handle Meta SDP answer - Set up audio bridging here
    if (event === "meta_answer_sdp") {
      console.log(`📞 Setting Meta answer SDP for call ${msgkartCallId}`);

      // Use the agentId from the request body, not from mapping
      const agentIdForCall = agentId || getAgentIdByCall(msgkartCallId);
      console.log(`🔍 Agent for call ${msgkartCallId} is ${agentIdForCall}`);

      await metaPC.setRemoteDescription({ type: "answer", sdp });
      
      // Force trigger track events by checking existing receivers
      setTimeout(() => {
        const existingReceivers = metaPC.getReceivers().filter(r => r.track);
        console.log(`🔍 MetaPC has ${existingReceivers.length} existing receivers after setRemoteDescription`);
        
        existingReceivers.forEach(receiver => {
          if (receiver.track && receiver.track.kind === "audio") {
            console.log(`🎯 Manually processing existing audio track: ${receiver.track.id}`);
            const agentIdForCall = getAgentIdByCall(msgkartCallId);
            if (agentIdForCall) {
              bridgeMetaTrackToBrowser(receiver.track, agentIdForCall, msgkartCallId);
            }
          }
        });
      }, 100);

      // Bridge audio if we have an agent
      if (agentIdForCall) {
        resetBrowserPCForNewCall(agentIdForCall);
        await bridgeAudioBetweenPeerConnections(agentIdForCall, msgkartCallId);
      } else {
        console.warn(`⚠️ No agent found for call ${msgkartCallId}, audio bridging skipped`);
      }

      return { status: "meta_answer_set" };
    }

    // 6️⃣ Terminate call
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

// Helper function to bridge meta track to browser
function bridgeMetaTrackToBrowser(track, agentId, callId) {
  try {
    const agentConn = getAgentConnection(agentId);
    if (!agentConn?.browserPC) {
      console.warn(`⚠️ No BrowserPC found for agent ${agentId}`);
      return;
    }

    const browserPC = agentConn.browserPC;

    // 🧩 Find existing audio sender on BrowserPC
    const existingSender = browserPC.getSenders().find(s => s.track?.kind === "audio");

    if (existingSender) {
      // ✅ Replace old track with the new Meta track
      existingSender.replaceTrack(track);
      console.log(`♻️ Reused existing BrowserPC sender for agent ${agentId}`);
    } else {
      // ✅ Only first time: add the track
      browserPC.addTrack(track);
      console.log(`🎤 Added new BrowserPC sender for agent ${agentId}`);
    }

    metaReady(callId, track);
    console.log(`🔊 Meta audio bridged → Browser (call ${callId}, agent ${agentId})`);
  } catch (err) {
    console.error(`❌ Error bridging meta track to browser:`, err);
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
    
    debugPeerConnectionState(agentConn.browserPC, 'BrowserPC');
    debugPeerConnectionState(callConn.metaPC, 'MetaPC');

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

function debugPeerConnectionState(pc, name) {
  console.log(`🔍 ${name} Debug:`);
  console.log(`   Connection state: ${pc.connectionState}`);
  console.log(`   ICE connection state: ${pc.iceConnectionState}`);
  console.log(`   Signaling state: ${pc.signalingState}`);

  const transceivers = pc.getTransceivers();
  console.log(`   Transceivers: ${transceivers.length}`);

  transceivers.forEach((transceiver, index) => {
    const receiverTrack = transceiver.receiver?.track;
    const senderTrack = transceiver.sender?.track;
    console.log(`   Transceiver ${index}:`);
    console.log(`     Direction: ${transceiver.direction}`);
    console.log(`     Receiver: ${receiverTrack?.id} (${receiverTrack?.kind})`);
    console.log(`     Sender: ${senderTrack?.id} (${senderTrack?.kind})`);
    console.log(`     CurrentDirection: ${transceiver.currentDirection}`);
  });
}