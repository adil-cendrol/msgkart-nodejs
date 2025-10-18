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

    // IMMEDIATELY forward existing browser tracks to Meta
    forwardExistingBrowserTracksToMeta(agentId, callId);

    // Set up ontrack handlers for both directions
    setupTrackForwarding(agentId, callId);

    console.log(`✅ Audio bridge established between agent ${agentId} and call ${callId}`);
  } catch (err) {
    console.error(`❌ Error bridging audio:`, err);
  }
}

// Immediately forward existing browser tracks to Meta
function forwardExistingBrowserTracksToMeta(agentId, callId) {
  try {
    const agentConn = getAgentConnection(agentId);
    const callConn = getCallConnection(callId);
    
    if (!agentConn || !callConn) return;

    const browserPC = agentConn.browserPC;
    const metaPC = callConn.metaPC;

    // Get all existing audio tracks from browser
    const browserReceivers = browserPC.getReceivers();
    const existingBrowserAudioTracks = browserReceivers
      .map(receiver => receiver.track)
      .filter(track => track && track.kind === "audio" && track.readyState === "live");

    console.log(`🔍 Found ${existingBrowserAudioTracks.length} existing browser audio tracks`);

    // Forward each existing browser track to Meta
    existingBrowserAudioTracks.forEach((track, index) => {
      try {
        // Check if this track is already in Meta
        const metaSenders = metaPC.getSenders();
        const alreadyForwarded = metaSenders.some(sender => 
          sender.track && sender.track.id === track.id
        );

        if (!alreadyForwarded) {
          // Add the track to Meta PC
          metaPC.addTrack(track);
          console.log(`🎤 Immediately forwarded existing browser audio track ${index + 1} to Meta`);
        } else {
          console.log(`🔄 Browser audio track ${index + 1} already in Meta`);
        }
      } catch (err) {
        console.error(`❌ Error forwarding browser track ${index + 1}:`, err);
      }
    });

    // Also check browser senders (outgoing tracks)
    const browserSenders = browserPC.getSenders();
    const outgoingBrowserTracks = browserSenders
      .map(sender => sender.track)
      .filter(track => track && track.kind === "audio" && track.readyState === "live");

    outgoingBrowserTracks.forEach((track, index) => {
      try {
        const metaSenders = metaPC.getSenders();
        const alreadyForwarded = metaSenders.some(sender => 
          sender.track && sender.track.id === track.id
        );

        if (!alreadyForwarded) {
          metaPC.addTrack(track);
          console.log(`🎤 Immediately forwarded outgoing browser audio track ${index + 1} to Meta`);
        }
      } catch (err) {
        console.error(`❌ Error forwarding outgoing browser track ${index + 1}:`, err);
      }
    });

  } catch (err) {
    console.error(`❌ Error in forwardExistingBrowserTracksToMeta:`, err);
  }
}

// Set up track forwarding in both directions
function setupTrackForwarding(agentId, callId) {
  const agentConn = getAgentConnection(agentId);
  const callConn = getCallConnection(callId);
  
  if (!agentConn || !callConn) return;

  const browserPC = agentConn.browserPC;
  const metaPC = callConn.metaPC;

  // Forward Meta audio to Browser
  metaPC.ontrack = (event) => {
    try {
      const track = event.track;
      if (track.kind === "audio") {
        console.log(`🎧 Meta audio track received for call ${callId}, forwarding to browser`);
        
        // Check if we already have this track in browser
        const browserReceivers = browserPC.getReceivers();
        const alreadyExists = browserReceivers.some(receiver => 
          receiver.track && receiver.track.id === track.id
        );
        
        if (!alreadyExists) {
          browserPC.addTrack(track);
          console.log(`🎧 Added meta audio track to browser`);
        } else {
          console.log(`🔄 Meta audio track already exists in browser`);
        }
        
        // Handle track ended event
        track.onended = () => {
          console.log(`🔇 Meta audio track ended for call ${callId}`);
        };
      }
    } catch (err) {
      console.error(`❌ Error forwarding meta audio to browser:`, err);
    }
  };

  // Forward Browser audio to Meta
  browserPC.ontrack = (event) => {
    try {
      const track = event.track;
      if (track.kind === "audio") {
        console.log(`🎤 New browser audio track received for agent ${agentId}, forwarding to meta`);
        
        // Check if we already have this track in meta
        const metaReceivers = metaPC.getReceivers();
        const alreadyExists = metaReceivers.some(receiver => 
          receiver.track && receiver.track.id === track.id
        );
        
        if (!alreadyExists) {
          metaPC.addTrack(track);
          console.log(`🎤 Added new browser audio track to meta`);
        } else {
          console.log(`🔄 Browser audio track already exists in meta`);
        }
        
        // Handle track ended event
        track.onended = () => {
          console.log(`🔇 Browser audio track ended for agent ${agentId}`);
        };
      }
    } catch (err) {
      console.error(`❌ Error forwarding browser audio to meta:`, err);
    }
  };
}