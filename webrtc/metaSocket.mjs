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
// handleMetaConnection.mjs - UPDATE the forwarding function
// Immediately forward existing browser tracks to Meta
// handleMetaConnection.mjs - UPDATE the forwarding function
// Immediately forward existing browser tracks to Meta
function forwardExistingBrowserTracksToMeta(agentId, callId) {
  try {
    const agentConn = getAgentConnection(agentId);
    const callConn = getCallConnection(callId);
    
    
    if (!agentConn || !callConn) return;

    const browserPC = agentConn.browserPC;
    const metaPC = callConn.metaPC;

    console.log(`🔍 Checking for browser audio tracks for agent ${agentId}`);

    // Method 1: Check stored tracks in agent connection
    if (agentConn.browserTracks && agentConn.browserTracks.size > 0) {
      console.log(`📦 Found ${agentConn.browserTracks.size} stored browser audio tracks`);
      
      let trackIndex = 0;
      agentConn.browserTracks.forEach((track) => {
        try {
          if (track.readyState === "live") {
            trackIndex++;
            
            // Get the audio stream from the track
            const stream = new MediaStream([track]);
            
            // Check if metaPC already has audio senders
            const metaSenders = metaPC.getSenders();
            const audioSenders = metaSenders.filter(sender => 
              sender.track && sender.track.kind === "audio"
            );

            if (audioSenders.length > 0) {
              // Replace track in existing sender
              const sender = audioSenders[0];
              sender.replaceTrack(track);
              console.log(`🔄 Replaced meta audio track with browser track ${trackIndex}`);
            } else {
              // Add new track if no audio sender exists
              metaPC.addTrack(track, stream);
              console.log(`🎤 Added browser audio track ${trackIndex} to Meta`);
            }
          }
        } catch (err) {
          console.error(`❌ Error forwarding stored track ${trackIndex}:`, err);
        }
      });
    }

    // Method 2: Get tracks from browser PC and forward them
    try {
      const browserSenders = browserPC.getSenders();
      const audioSenders = browserSenders.filter(sender => 
        sender.track && sender.track.kind === "audio" && sender.track.readyState === "live"
      );

      console.log(`🎤 Found ${audioSenders.length} browser sender audio tracks`);

      audioSenders.forEach((browserSender, index) => {
        try {
          const metaSenders = metaPC.getSenders();
          const existingAudioSenders = metaSenders.filter(sender => 
            sender.track && sender.track.kind === "audio"
          );

          if (existingAudioSenders.length > 0) {
            // Replace track in existing meta sender
            const metaSender = existingAudioSenders[0];
            metaSender.replaceTrack(browserSender.track);
            console.log(`🔄 Replaced meta sender with browser audio track ${index + 1}`);
          } else {
            // Create new sender in meta PC
            metaPC.addTrack(browserSender.track);
            console.log(`🎤 Added browser sender audio track ${index + 1} to Meta`);
          }
        } catch (err) {
          console.error(`❌ Error forwarding sender track ${index + 1}:`, err);
        }
      });
    } catch (err) {
      console.error(`❌ Error processing browser senders:`, err);
    }

    // Method 3: Create a new transceiver for forwarding
    try {
      const browserReceivers = browserPC.getReceivers();
      const audioReceivers = browserReceivers.filter(receiver => 
        receiver.track && receiver.track.kind === "audio" && receiver.track.readyState === "live"
      );

      console.log(`🎧 Found ${audioReceivers.length} browser receiver audio tracks`);

      audioReceivers.forEach((receiver, index) => {
        try {
          const track = receiver.track;
          
          // Check if we need to create a transceiver in meta PC
          const metaTransceivers = metaPC.getTransceivers();
          const audioTransceivers = metaTransceivers.filter(t => 
            t.receiver.track && t.receiver.track.kind === "audio"
          );

          if (audioTransceivers.length > 0) {
            // Use existing transceiver
            const transceiver = audioTransceivers[0];
            if (transceiver.sender) {
              transceiver.sender.replaceTrack(track);
              console.log(`🔄 Replaced transceiver track with browser audio ${index + 1}`);
            }
          } else {
            // Add track directly
            metaPC.addTrack(track);
            console.log(`🎤 Added browser receiver audio track ${index + 1} to Meta`);
          }
        } catch (err) {
          console.error(`❌ Error forwarding receiver track ${index + 1}:`, err);
        }
      });
    } catch (err) {
      console.error(`❌ Error processing browser receivers:`, err);
    }

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