// handleBrowserConnection.mjs
import { browserReady } from "../audio/audioMixer.mjs";
import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
import {
    createBrowserConnection,
    getAgentConnection,
    listAgentIds,
    removeAgentConnection,
    getCallConnection,
    getCallIdByAgent,
} from "./connectionManager.mjs";

/**
 * Handles incoming browser-side WebRTC offers and manages agent/browser peer connections.
 */
export async function handleBrowserConnection(response) {
    try {
        const { event, agentId, sdp } = response;
        if (!agentId) return { status: "missing_agent" };
        if (!event) return { status: "event_missing" };

        // ✅ Always ensure agent has a PeerConnection ready
        let agentConn = getAgentConnection(agentId);
        if (!agentConn?.browserPC) {
            const { pc: browserPC, candidates: browserCandidates } =
                await createPeerConnection("sendrecv");

            createBrowserConnection(agentId, browserPC, browserCandidates);
            agentConn = getAgentConnection(agentId);
            console.log(`🧩 Created new browserPC for agent ${agentId}`);
        }
        const browserPC = agentConn.browserPC;
        // --- Handle browser offer ---
        if (event === "browser_offer_sdp") {
            if (!sdp) return { status: "sdp_missing" };
            try {
                await browserPC.setRemoteDescription({ type: "offer", sdp });
                const answer = await browserPC.createAnswer();
                await browserPC.setLocalDescription(answer);
                const finalBrowserSDP = finalizeSDP(
                    browserPC,
                    getAgentConnection(agentId)?.browserCandidates
                );
                console.log(`✅ Browser offer handled successfully for agent ${agentId}`);
                return {
                    agentId,
                    sdp: finalBrowserSDP,
                    sdpType: "answer",
                    status: "agent_answer_created",
                };
            } catch (err) {
                console.error(`❌ Error handling browser_offer_sdp for ${agentId}:`, err);
                return { status: "error", message: err.message };
            }
        }

        // --- Handle browser termination ---
        if (event === "browser_terminate") {
            try {
                removeAgentConnection(agentId);
                console.log(`👋 Agent ${agentId} removed`);
                // console.log("Available agents:", listAgentIds());
                return { status: "agent_removed" };
            } catch (err) {
                console.error(`❌ Error removing agent ${agentId}:`, err);
                return { status: "error_removing_agent", message: err.message };
            }
        }

        // --- Unknown event ---
        return { status: "no_event_match" };

    } catch (err) {
        console.error(`❌ Global error in handleBrowserConnection:`, err);
        return { status: "fatal_error", message: err.message };
    }
}
