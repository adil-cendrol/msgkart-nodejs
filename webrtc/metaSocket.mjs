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
    const {
      event,
      msgkartCallId,
      sdp,
      agentId,
      SubscriberId,
      BusinessId,
      presignedUrl
    } = response;

    // 1️⃣ Get or create Meta PeerConnection
    let callConn = getCallConnection(msgkartCallId);
    if (!callConn?.metaPC) {
      const pcObj = await createPeerConnection("sendrecv");
      createMetaConnection(msgkartCallId, pcObj.pc, pcObj.candidates);
      callConn = getCallConnection(msgkartCallId);
      console.log(`🧩 Created new metaPC for call ${msgkartCallId}`);
    }

    const metaPC = callConn.metaPC;
    const metaCandidates = callConn.metaCandidates;

    // Initialize track list guards
    metaPC._addedTracks = metaPC._addedTracks || [];

    // 2️⃣ Handle Meta → Browser audio
    metaPC.onTrack.subscribe(track => {
      const agentIdForCall = [...agentToCall.entries()]
        .find(([agentId, cId]) => cId === msgkartCallId)?.[0];
      if (!agentIdForCall) {
        console.warn(`⚠️ No agent mapped for call ${msgkartCallId}`);
        return;
      }

      const agentConn = getAgentConnection(agentIdForCall);
      const activeBrowserPC = agentConn?.browserPC;
      if (track.kind === "audio" && activeBrowserPC) {
        activeBrowserPC._addedTracks = activeBrowserPC._addedTracks || [];
        const alreadyAdded = activeBrowserPC._addedTracks.includes(track);

        if (!alreadyAdded) {
          console.log("🎧 Meta audio track received → forwarding to Browser");
          activeBrowserPC.addTrack(track);
          activeBrowserPC._addedTracks.push(track);
        } else {
          console.log("⚠️ Skipping duplicate Meta→Browser track add");
        }

        metaReady(msgkartCallId, track);
        track.onReceiveRtp.subscribe(rtp => {
          console.log("📥 RTP from Meta:", rtp.header.timestamp);
        });
      }
    });

    // 3️⃣ Handle Meta SDP offer request
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      const finalSDP = finalizeSDP(metaPC, metaCandidates);

      console.log(`✅ Meta offer SDP created for call ${msgkartCallId}`);
      return {
        msgkartCallId,
        sdp: finalSDP,
        SdpType: "offer",
        SubscriberId,
        BusinessId
      };
    }

    // 4️⃣ Handle Meta SDP answer
    if (event === "meta_answer_sdp") {
      console.log(`📞 Setting Meta answer SDP for call ${msgkartCallId}`);

      if (agentId && msgkartCallId) {
        mapAgentToCall(agentId, msgkartCallId); // 🔥 Auto link agent→call
      }

      const agentConn = getAgentConnection(agentId);
      const browserPC = agentConn?.browserPC;
      if (!browserPC) {
        console.warn(`⚠️ No browserPC found for agent ${agentId}`);
      }

      browserPC._addedTracks = browserPC?._addedTracks || [];

      await metaPC.setRemoteDescription({ type: "answer", sdp });

      // Forward Browser audio → Meta
      browserPC?.onTrack.subscribe(track => {
        if (track.kind === "audio") {
          const alreadyAdded = metaPC._addedTracks.includes(track);
          if (!alreadyAdded) {
            console.log("🎤 Forwarding Browser audio → Meta");
            metaPC.addTrack(track);
            metaPC._addedTracks.push(track);
          } else {
            console.log("⚠️ Skipping duplicate Browser→Meta track add");
          }

          browserReady(msgkartCallId, track);
          console.log(
            `🔊 Browser audio bridged → Meta (call ${msgkartCallId}, agent ${agentId})`
          );
        }

        track.onReceiveRtp.subscribe(rtp => {
          console.log("📥 RTP from Browser:", rtp.header.timestamp);
        });
      });

      return { status: "meta_answer_set" };
    }

    // 5️⃣ Terminate call
    if (event === "terminate") {
      await stopRecording(msgkartCallId, presignedUrl);
      removeCallConnection(msgkartCallId);
      console.log(`🛑 Call ${msgkartCallId} ended and uploaded`);
      return {
        status: `call_disconnected ${msgkartCallId} and ${SubscriberId}`
      };
    }

    return { status: "no event type match" };
  } catch (err) {
    console.error(`❌ Global error in handleMetaConnection:`, err);
    return { status: "fatal_error", message: err.message };
  }
}
