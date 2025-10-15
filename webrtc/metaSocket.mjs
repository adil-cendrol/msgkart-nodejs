// metaHandler.mjs
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  createBrowserConnection,
  getCallConnection,
  getAgentConnection,
  removeCallConnection,
  removeAgentConnection,
  listAgentIds,
} from "./connectionManager.mjs";

import { browserReady, metaReady, stopRecording } from "../audio/audioMixer.mjs"

/**
 * response: { eventType, callId, sdp, agentId }
 */
export async function handleMetaConnection(response) {
  const { eventType, callId, sdp, agentId } = response;
  if (!eventType) return { status: "no_event" };

  // Ensure metaPC for this call exists (create if missing)
  let callConn = getCallConnection(callId);
  if (!callConn?.metaPC) {
    const pcObj = await createPeerConnection("sendrecv");
    const metaPC = pcObj.pc;
    const metaCandidates = pcObj.candidates;
    createMetaConnection(callId, metaPC, metaCandidates);
    callConn = getCallConnection(callId);

    // meta -> browser bridging: when meta receives track, attach to agent's browserPC if available
    if (metaPC.onTrack) {
      metaPC.onTrack.subscribe((track) => {
        const agentConn = getAgentConnection(agentId);
        if (track.kind === "audio" && agentConn?.browserPC) {
          try {
            agentConn.browserPC.addTrack(track);
            metaReady(callId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${callId}, agent ${agentId})`);
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
            metaReady(callId, track);
            console.log(`🔊 Meta audio bridged → Browser (call ${callId}, agent ${agentId})`);
          } catch (err) {
            console.warn("bridge meta->browser failed:", err?.message || err);
          }
        } else {
          metaReady(callId, track);
        }
      };
    }
  }

  const metaPC = getCallConnection(callId)?.metaPC;
  const metaCandidates = getCallConnection(callId)?.metaCandidates;

  // ---------- Events ----------
  if (eventType === "metaoffer") {
    const offer = await metaPC.createOffer();
    await metaPC.setLocalDescription(offer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { callId, sdp: finalSDP, status: "offer_created" };
  }

  if (eventType === "metaAnswer") {
    await metaPC.setRemoteDescription({ type: "answer", sdp });
    console.log(`✅ Meta PC remote description set for call ${callId}`);
    return { status: "meta_answer_set" };
  }

  if (eventType === "metawithoffer") {
    await metaPC.setRemoteDescription({ type: "offer", sdp });
    const answer = await metaPC.createAnswer();
    await metaPC.setLocalDescription(answer);
    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { callId, sdp: finalSDP, status: "answer_created" };
  }

  // ---------- Agent (browser) offer: create or reuse agent's browserPC ----------
  if (eventType === "agentOffer") {
    if (!agentId) return { status: "missing_agent" };
    
    let agentConn = getAgentConnection(agentId);
    if (!agentConn?.browserPC) {
      const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
      createBrowserConnection(agentId, browserPC, browserCandidates);
      agentConn = getAgentConnection(agentId);

      // browser -> meta bridging on track
      if (browserPC.onTrack) {
        browserPC.onTrack.subscribe((track) => {
          if (track.kind === "audio" && metaPC) {
            try {
              metaPC.addTrack(track);
              browserReady(callId, track);
              console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);

            } catch (err) {
              console.warn("bridge browser->meta failed:", err?.message || err);
            }
          } else {
            browserReady(callId, track);
          }
        });
      } else if (browserPC.ontrack !== undefined) {
        browserPC.ontrack = (ev) => {
          const track = ev.track;
          if (track.kind === "audio" && metaPC) {
            try {
              metaPC.addTrack(track);
              browserReady(callId, track);
              console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
            } catch (err) {
              console.warn("bridge browser->meta failed:", err?.message || err);
            }
          } else {
            browserReady(callId, track);
          }
        };
      }
    }

    const agentBrowserPC = getAgentConnection(agentId).browserPC;
    await agentBrowserPC.setRemoteDescription({ type: "offer", sdp });
    const answer = await agentBrowserPC.createAnswer();
    await agentBrowserPC.setLocalDescription(answer);
    const finalBrowserSDP = finalizeSDP(agentBrowserPC, getAgentConnection(agentId)?.browserCandidates);
    return { callId, agentId, sdp: finalBrowserSDP, status: "agent_answer_created" };
  }

  if (eventType === "agentAnswer") {
    if (!agentId) return { status: "missing_agent" };
    const agentConn = getAgentConnection(agentId);
    if (agentConn?.browserPC) {
      await agentConn.browserPC.setRemoteDescription({ type: "answer", sdp });
      console.log(`✅ Browser PC remote description set for agent ${agentId}`);
    }
    return { status: "agent_answer_set" };
  }

  if (eventType === "call_ended") {
    stopRecording(callId);
    removeCallConnection(callId);
    console.log(`🛑 Call ${callId} ended and cleaned up`);
    return { status: "call_disconnected" };
  }

  if (eventType === "agent_removed") {
    const listofAgent = listAgentIds()
    removeAgentConnection(agentId);
    console.log(`👋 Agent ${agentId} removed`);
    console.log(listofAgent , "list of avaibale agent is there")
    return { status: "agent_removed" };
  }
  // list of all agent connected


  return { status: "ignored_event" };
}



