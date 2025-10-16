import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  mapAgentToCall
} from "./connectionManager.mjs";

import { metaReady, stopRecording } from "../audio/audioMixer.mjs";

export async function handleMetaConnection(response) {
  const { event, msgkartCallId, sdp, agentId, SubscriberId, BusinessId } = response;
  let callConn = getCallConnection(msgkartCallId);
  if (!callConn?.metaPC) {
    const pcObj = await createPeerConnection("sendrecv");
    const metaPC = pcObj.pc;
    const metaCandidates = pcObj.candidates;
    createMetaConnection(msgkartCallId, metaPC, metaCandidates);
    callConn = getCallConnection(msgkartCallId);

    if (metaPC.ontrack !== undefined) {
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
        } 
      };
    }
  }

  const metaPC = getCallConnection(msgkartCallId)?.metaPC;
  const metaCandidates = getCallConnection(msgkartCallId)?.metaCandidates;

  if (event === "metaSdpOffer") {
    const offer = await metaPC.createOffer();
    await metaPC.setLocalDescription(offer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { msgkartCallId, sdp: finalSDP, SdpType: "offer", SubscriberId, BusinessId };
  }

  if (event === "metaSdpAnswer") {
    await metaPC.setRemoteDescription({ type: "answer", sdp });
    if (agentId && msgkartCallId) mapAgentToCall(agentId, msgkartCallId); // 🔥 Auto link
    console.log(`✅ Meta PC remote description set for call ${msgkartCallId}`);
    return { status: "meta_answer_set" };
  }

  if (event === "metaTerminate") {
    stopRecording(msgkartCallId);
    removeCallConnection(msgkartCallId);
    console.log(`🛑 Call ${msgkartCallId} ended and cleaned up`);
    return { status: `call_disconnected ${msgkartCallId} and ${SubscriberId}` };
  }

  return { status: `no event type match` };
}
