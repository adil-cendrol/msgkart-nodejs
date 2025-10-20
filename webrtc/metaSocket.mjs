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
  cleanupBrowserPCTracks
} from "./connectionManager.mjs";
import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs";
import { MediaStream } from "werift";

export async function handleMetaConnection(response) {
  try {
    const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId, presignedUrl } = response;

    // 1️⃣ Get or create Meta PC
    let callConn = getCallConnection(msgkartCallId);
    if (!callConn?.metaPC) {
      const pcObj = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pcObj.pc, pcObj.candidates);
      callConn = getCallConnection(msgkartCallId);
      callConn.metaPC._ontrackSet = false;
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
          if (track.kind === "audio") {
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
        cleanupBrowserPCTracks(agentIdForCall);
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
// async function bridgeAudioBetweenPeerConnections(agentId, callId) {
//   try {
//     const agentConn = getAgentConnection(agentId);
//     const callConn = getCallConnection(callId);
//     if (!agentConn || !callConn) {
//       console.warn(`⚠️ Cannot bridge: agent ${agentId} or call ${callId} not found`);
//       return;
//     }

//     const browserPC = agentConn.browserPC;
//     const metaPC = callConn.metaPC;

//     console.log(`🔊 Bridging audio between agent ${agentId} and call ${callId}`, !metaPC);

//     // Forward browser audio tracks to meta
//     const browserTracks = browserPC.getTransceivers()
//       .filter(transceiver => transceiver.receiver.track)
//       .map(transceiver => transceiver.receiver.track);

//     browserTracks.forEach(track => {
//       if (track.kind === "audio") {
//         if (!metaPC.getTransceivers().some(t => t.receiver.track === track)) {
//           metaPC.addTrack(track);
//           browserReady(callId, track);
//           console.log(`🎤 Forwarding browser audio to meta for call ${callId}`);
//         }
//       }
//     });
//     console.log(`✅ Audio bridge established between agent ${agentId} and call ${callId}`);
//   } catch (err) {
//     console.error(`❌ Error bridging audio:`, err);
//   }

// async function bridgeAudioBetweenPeerConnections(agentId, callId) {
//   try {
//     const agentConn = getAgentConnection(agentId);
//     const callConn = getCallConnection(callId);
//     if (!agentConn || !callConn) return;

//     const browserPC = agentConn.browserPC;
//     const metaPC = callConn.metaPC;

//     debugPeerConnectionState(agentConn.browserPC, 'BrowserPC');
//     debugPeerConnectionState(callConn.metaPC, 'MetaPC');
//     console.log(`🔊 Setting up audio bridge for agent ${agentId} and call ${callId}`);

//     // Get the remote stream from browserPC (tracks received from browser)
//     const remoteStreams = browserPC.getReceivers().map(receiver => receiver.track);
//     const audioTracks = remoteStreams.filter(track => track.kind === "audio");

//     console.log(`🎤 Found ${audioTracks.length} remote audio tracks from browser`);

//     // For each audio track, create a new sender in metaPC
//     audioTracks.forEach(track => {
//       try {
//         // In werift, we need to be careful about track reuse
//         // Create a new media stream for isolation
//         const mediaStream = new MediaStream();
//         mediaStream.addTrack(track);

//         // Add track with the media stream
//         metaPC.addTrack(track, mediaStream);
//         browserReady(callId, track);

//         console.log(`✅ Bridged browser track to metaPC: ${track.id}`);
//       } catch (err) {
//         console.error(`❌ Failed to bridge track ${track.id}:`, err);

//         // Fallback: create new transceiver
//         try {
//           metaPC.addTransceiver(track, { direction: "sendonly" });
//           console.log(`✅ Used fallback transceiver for track: ${track.id}`);
//         } catch (fallbackErr) {
//           console.error(`❌ Fallback also failed for track ${track.id}:`, fallbackErr);
//         }
//       }
//     });

//     console.log(`✅ Audio bridge established for call ${callId}`);

//   } catch (err) {
//     console.error(`❌ Error bridging audio:`, err);
//   }


// }

async function bridgeAudioBetweenPeerConnections(agentId, callId) {
  try {
    const agentConn = getAgentConnection(agentId);
    const callConn = getCallConnection(callId);
    if (!agentConn || !callConn) return;

    const browserPC = agentConn.browserPC;
    const metaPC = callConn.metaPC;

    debugPeerConnectionState(browserPC, 'BrowserPC');
    debugPeerConnectionState(metaPC, 'MetaPC');
    console.log(`🔊 Bridging audio for agent ${agentId} and call ${callId}`);

    // Get the single audio track from BrowserPC’s receiver
    const audioReceiver = browserPC.getReceivers().find(r => r.track?.kind === "audio");
    const track = audioReceiver?.track;

    if (!track) {
      console.warn(`⚠️ No audio track found in BrowserPC for agent ${agentId}`);
      return;
    }

    // Reuse existing meta sender if exists
    let sender = metaPC.getSenders().find(s => s.track?.kind === "audio");

    if (sender) {
      await sender.replaceTrack(track);
      console.log(`♻️ Reused metaPC sender for new track ${track.id}`);
    } else {
      const stream = new MediaStream([track]);
      metaPC.addTrack(track, stream);
      console.log(`🎤 Added new metaPC sender for track ${track.id}`);
    }

    browserReady(callId, track);
    console.log(`✅ Audio bridge established for call ${callId}`);
  } catch (err) {
    console.error(`❌ Error in bridgeAudioBetweenPeerConnections:`, err);
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