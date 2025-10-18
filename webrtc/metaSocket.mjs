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
    // const agentConn = getAgentConnection(agentId);
    // const browserPC = agentConn?.browserPC;

    // 2️⃣ Attach ontrack once
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
          // if (!agentConn?.browserPC) return;
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
          agentConn.browserPC.getSenders().forEach(sender => {
            const track = sender.track;
            if (track?.kind === "audio") {
              // Prevent adding the same track twice
              // if (!metaPC.getSenders().some(s => s.track === track)) {
                metaPC.addTrack(track);
                browserReady(msgkartCallId, track);
              // }
            }
          });


        } catch (err) {
          console.error(`❌ Error in metaPC ontrack for call ${msgkartCallId}:`, err);
        }
      };
    }


    // 3️⃣ Handle Meta SDP offer request
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      const finalSDP = finalizeSDP(metaPC, metaCandidates);

      console.log(finalSDP, "findal spd offer sdp");
      return { msgkartCallId, sdp: finalSDP, SdpType: "offer", SubscriberId, BusinessId };
    }

    // 4️⃣ Handle Meta SDP answer
    if (event === "meta_answer_sdp") {
      console.log(`📞 Setting Meta answer SDP for call ${msgkartCallId}`);
      if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId); // 🔥 Auto link
      await metaPC.setRemoteDescription({ type: "answer", sdp });



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
