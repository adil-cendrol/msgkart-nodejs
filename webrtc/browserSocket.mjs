// handleBrowserConnection.mjs
import { browserReady } from "../audio/audioMixer.mjs";
import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
import {
    createBrowserConnection,
    getAgentConnection,
    removeAgentConnection,
    getCallConnection,
    getCallIdByAgent
} from "./connectionManager.mjs";

/**
 * Handles incoming browser-side WebRTC offers and manages agent/browser peer connections.
 */
export async function handleBrowserConnection(response) {
    try {
        const { event, agentId, sdp } = response;
        if (!agentId) return { status: "missing_agent" };
        if (!event) return { status: "event_missing" };

        // ✅ Ensure agent has a PeerConnection ready
        let agentConn = getAgentConnection(agentId);
        if (!agentConn?.browserPC) {
            const { pc: browserPC, candidates: browserCandidates } =
                await createPeerConnection("sendrecv");

            createBrowserConnection(agentId, browserPC, browserCandidates);
            agentConn = getAgentConnection(agentId);
            console.log(`🧩 Created new browserPC for agent ${agentId}`);
        }

        const browserPC = agentConn.browserPC;

        // ✅ Attach ontrack listener once
        if (!browserPC._ontrackSet) {
            browserPC._ontrackSet = true;
            browserPC.ontrack = (ev) => {
                try {
                    const track = ev.track;
                    const callId = getCallIdByAgent(agentId);

                    if (!callId) {
                        console.warn(`⚠️ No callId yet for agent ${agentId}, track cannot be bridged`);
                        return;
                    }

                    const callConn = getCallConnection(callId);
                    const metaPC = callConn?.metaPC;

                    if (track.kind === "audio" && metaPC) {
                        metaPC.addTrack(track);
                        browserReady(callId, track);
                        console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
                    } else {
                        console.warn(`⚠️ No metaPC found or invalid track kind for agent ${agentId}`);
                    }
                } catch (err) {
                    console.error(`❌ Error in browser ontrack for agent ${agentId}:`, err);
                }
            };
        }

        // --- Handle browser offer ---
        if (event === "browser_offer_sdp") {
            if (!sdp) return { status: "sdp_missing" };

            await browserPC.setRemoteDescription({ type: "offer", sdp });
            const answer = await browserPC.createAnswer();
            await browserPC.setLocalDescription(answer);

            const finalBrowserSDP = finalizeSDP(browserPC, browserCandidates);
            console.log(`✅ Browser offer handled successfully for agent ${agentId}`);

            return {
                agentId,
                sdp: finalBrowserSDP,
                sdpType: "answer",
                status: "agent_answer_created",
            };
        }

        // --- Handle browser termination ---
        if (event === "browser_terminate") {
            removeAgentConnection(agentId);
            console.log(`👋 Agent ${agentId} removed`);
            return { status: "agent_removed" };
        }

        return { status: "no_event_match" };

    } catch (err) {
        console.error(`❌ Global error in handleBrowserConnection:`, err);
        return { status: "fatal_error", message: err.message };
    }
}
