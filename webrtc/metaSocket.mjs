// metaHandler.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
} from "./connectionManager.mjs";

import { metaReady, stopRecording } from "../audio/audioMixer.mjs"

/**
 * response: { event, msgkartCallId, sdp, agentId }
 */
export async function handleMetaConnection(response) {
  const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId } = response;
  let callConn = getCallConnection(msgkartCallId);
  if (!callConn?.metaPC) {
    const pcObj = await createPeerConnection("sendrecv");
    const metaPC = pcObj.pc;
    const metaCandidates = pcObj.candidates;
    createMetaConnection(msgkartCallId, metaPC, metaCandidates);
    callConn = getCallConnection(msgkartCallId);
    // meta -> browser bridging: when meta receives track, attach to agent's browserPC if available
    if (metaPC.onTrack) {
      metaPC.onTrack.subscribe((track) => {
        const agentConn = getAgentConnection(agentId);
        if (track.kind === "audio" && agentConn?.browserPC) {
          try {
            agentConn.browserPC.addTrack(track);
            metaReady(msgkartCallId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${msgkartCallId}, agent ${agentId})`);
          } catch (err) {
            console.warn("bridge meta -> browser failed:", err?.message || err);
          }
        }
      });
    }
    else if (metaPC.ontrack !== undefined) {
      metaPC.ontrack = (ev) => {
        const track = ev.track;
        const agentConn = getAgentConnection(agentId);
        if (track.kind === "audio" && agentConn?.browserPC) {
          try {
            agentConn.browserPC.addTrack(track);
            metaReady(msgkartCallId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${msgkartCallId}, agent ${agentId})`);
          } catch (err) {
            console.warn("bridge meta->browser failed:", err?.message || err);
          }
        } else {
          metaReady(msgkartCallId, track);
        }
      };
    }
  }

  const metaPC = getCallConnection(msgkartCallId)?.metaPC;
  const metaCandidates = getCallConnection(msgkartCallId)?.metaCandidates;

  // ---------- Events ----------
  if (event === "metaSdpOffer") {
    const offer = await metaPC.createOffer();
    await metaPC.setLocalDescription(offer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { msgkartCallId, sdp: finalSDP, SdpType: "offer", SubscriberId, BusinessId };
  }

  if (event === "metaSdpAnswer") {
    await metaPC.setRemoteDescription({ type: "answer", sdp });
    console.log(`✅ Meta PC remote description set for call ${msgkartCallId}`);
    return { status: "meta_answer_set" };
  }



  // if (event === "metawithoffer") {
  //   await metaPC.setRemoteDescription({ type: "offer", sdp });
  //   const answer = await metaPC.createAnswer();
  //   await metaPC.setLocalDescription(answer);
  //   const finalSDP = finalizeSDP(metaPC, metaCandidates);
  //   return { msgkartCallId, sdp: finalSDP, status: "answer_created" };
  // }
  if (event === "metaTerminate") {
    stopRecording(msgkartCallId);
    removeCallConnection(msgkartCallId);
    console.log(`🛑 Call ${msgkartCallId} ended and cleaned up`);
    return { status: `call_disconnected ${msgkartCallId} and ${SubscriberId} ` };
  }
  return { status: `no event type match with my node js` };
}



