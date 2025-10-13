import { v4 as uuidv4 } from "uuid";
import { createPeerConnection, finalizeSDP } from "../utils/peerUtils.mjs";
import {
  createMetaConnection,
  createBrowserConnection,
  getConnection,
} from "./connectionManager.mjs";

import { browserReady, metaReady, stopRecording } from "./audioRecorder.mjs";

/**
 * Handle Meta connection via REST event (from Backend2)
 * @param {Object} params
 * @param {string} params.eventType - 'createOffer' | 'answer'
 * @param {string} params.callId - unique call identifier
 * @param {string} params.sdp - SDP from Backend2 (if answer)
 * @param {WebSocket} params.browserWs - Browser WS connection for this call
 */
export async function handleMetaConnect({ eventType, callId, sdp, browserWs }) {
  if (!callId) throw new Error("callId is required");

  // 1️⃣ Create Meta PeerConnection if needed
  let metaPC;
  let metaCandidates;
  if (!getConnection(callId)?.metaPC) {
    const pcObj = await createPeerConnection("sendrecv");
    metaPC = pcObj.pc;
    metaCandidates = pcObj.candidates;
    createMetaConnection(callId, null, metaPC);

    // Bridge audio from Meta → Browser
    metaPC.onTrack.subscribe((track) => {
      const conn = getConnection(callId);
      if (track.kind === "audio" && conn?.browserPC) {
        conn.browserPC.addTrack(track);
        metaReady(callId, track);
      }
    });
  } else {
    metaPC = getConnection(callId).metaPC;
  }

  // ---------------- Handle events ----------------
  if (eventType === "createOffer") {
    const offer = await metaPC.createOffer();
    await metaPC.setLocalDescription(offer);

    const finalSDP = finalizeSDP(metaPC, metaCandidates);
    return { callId, sdp: finalSDP, status: "offer_created" };
  }

  if (eventType === "answer") {
    if (!sdp) throw new Error("SDP required for answer");

    await metaPC.setRemoteDescription({ type: "answer", sdp });
    console.log(`✅ Meta PC remote description set for call ${callId}`);

    // 2️⃣ Create Browser offer
    if (!browserWs) {
      console.warn(`⚠️ Browser WS not connected for call ${callId}`);
      return { status: "browser_ws_missing" };
    }

    const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
    createBrowserConnection(callId, browserWs, browserPC);

    browserPC.onTrack.subscribe((track) => {
      if (track.kind === "audio" && metaPC) {
        console.log(`🎤 Browser audio → Meta for ${uuid}`);
        metaPC.addTrack(track);
        browserReady(callId, track);
      }
    });
    const browserOffer = await browserPC.createOffer();
    await browserPC.setLocalDescription(browserOffer);
    const finalBrowserSDP = finalizeSDP(browserPC, browserCandidates);

    // Send offer to Browser WS
    browserWs.send(JSON.stringify({
      event_type: "offer_for_browser",
      internalCallId: callId,
      sdp: finalBrowserSDP
    }));

    console.log(`📤 Browser offer sent for call ${callId}`);
    // return { status: "browser_offer_sent" };
  }

  return { status: "ignored_event" };
}
