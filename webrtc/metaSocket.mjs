// handleMetaConnection.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall,
  listAgentIds
} from "./connectionManager.mjs";

import { metaReady, stopRecording } from "../audio/audioMixer.mjs";

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

    // 2️⃣ Always attach ontrack once
    if (!metaPC._ontrackSet) {
      metaPC._ontrackSet = true;
      metaPC.ontrack = (ev) => {
        try {
          const track = ev.track;
          console.log(`Adil nawaz afjkmdf===agent ${agentId}`);
          const listofagents = listAgentIds();
          console.log(listofagents, "list of agents available");
          const agentConn = getAgentConnection(agentId) || "50a5ab07-8111-4ea4-9688-31ec1bde8322";

          console.log(`📶 Meta ontrack triggered for call ${msgkartCallId}, agent ${agentId}`);
          console.log(agentConn, "agent connection details");

          if (track.kind === "audio" && agentConn?.browserPC) {
            agentConn.browserPC.addTrack(track);
            metaReady(msgkartCallId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${msgkartCallId}, agent ${agentId})`);

            if (track.onReceiveRtp) {
              track.onReceiveRtp.subscribe((rtp) => {
                console.log("📥 RTP from Meta:", rtp.header.timestamp);
              });
            }
          } else {
            console.warn(`⚠️ No browserPC found or invalid track kind for agent ${agentId}`);
          }
        } catch (err) {
          console.error(`❌ Error in metaPC ontrack for agent ${agentId}:`, err);
        }
      };
    }

    // 3️⃣ Handle SDP request from Meta
    if (event === "request_meta_offer_sdp") {
      const offer = await metaPC.createOffer();
      await metaPC.setLocalDescription(offer);
      const finalSDP = finalizeSDP(metaPC, metaCandidates);

      console.log(`✅ Meta offer SDP created for call ${msgkartCallId}`);
      return { msgkartCallId, sdp: finalSDP, SdpType: "offer", SubscriberId, BusinessId };
    }

    // 4️⃣ Handle Meta answer from browser/telephony
    if (event === "meta_answer_sdp") {
      console.log(`📞 Setting Meta answer SDP for call ${msgkartCallId}`);
      await metaPC.setRemoteDescription({ type: "answer", sdp });
      console.log(`✅ Meta PC remote description set for call ${msgkartCallId}, agentId ${agentId}`);

      if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId); // 🔥 Auto link
      return { status: "meta_answer_set" };
    }

    // 5️⃣ Handle call termination
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
