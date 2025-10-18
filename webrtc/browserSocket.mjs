import { browserReady } from "../audio/audioMixer.mjs";
import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
import {
    createBrowserConnection,
    getAgentConnection,
    removeAgentConnection
} from "./connectionManager.mjs";

/**
 * Handles browser-side WebRTC connections.
 */
// handleBrowserConnection.mjs
export async function handleBrowserConnection(response) {
    const { event, agentId, sdp } = response;
    if (!agentId) return { status: "missing_agent" };
    if (!event) return { status: "event_missing" };

    let agentConn = getAgentConnection(agentId);

    // Create browser PC if it doesn't exist
    if (!agentConn?.browserPC) {
        const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
        createBrowserConnection(agentId, browserPC, browserCandidates);
        agentConn = getAgentConnection(agentId);
        console.log(`🧩 Created new browserPC for agent ${agentId}`);

        // Set up browser PC track event to forward to meta when available
        browserPC.ontrack = (ev) => {
            const track = ev.track;
            if (track.kind === "audio") {
                console.log(`🎤 Browser audio track received for agent ${agentId}`);
                // This track will be forwarded to meta when meta connection is established
            }
        };
    }

    const browserPC = agentConn.browserPC;

    if (event === "browser_offer_sdp") {
        if (!sdp) return { status: "sdp_missing" };

        await browserPC.setRemoteDescription({ type: "offer", sdp });
        const answer = await browserPC.createAnswer();
        await browserPC.setLocalDescription(answer);

        const finalBrowserSDP = finalizeSDP(browserPC, agentConn.browserCandidates);
        console.log(`✅ Browser offer handled for agent ${agentId}`);

        return {
            agentId,
            sdp: finalBrowserSDP,
            sdpType: "answer",
            status: "agent_answer_created"
        };
    }

    if (event === "browser_terminate") {
        removeAgentConnection(agentId);
        console.log(`👋 Agent ${agentId} removed`);
        return { status: "agent_removed" };
    }

    return { status: "no_event_match" };
}