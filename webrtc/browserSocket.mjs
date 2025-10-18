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
export async function handleBrowserConnection(response) {
    const { event, agentId, sdp } = response;
    if (!agentId) return { status: "missing_agent" };
    if (!event) return { status: "event_missing" };

    let agentConn = getAgentConnection(agentId);
    if (!agentConn?.browserPC) {
        const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
        createBrowserConnection(agentId, browserPC, browserCandidates);
        agentConn = getAgentConnection(agentId);
        console.log(`🧩 Created new browserPC for agent ${agentId}`);
    }
    const browserPC = agentConn.browserPC;

    if (event === "browser_offer_sdp") {
        if (!sdp) return { status: "sdp_missing" };
        await browserPC.setRemoteDescription({ type: "offer", sdp });
        const answer = await browserPC.createAnswer();
        await browserPC.setLocalDescription(answer);
        const finalBrowserSDP = finalizeSDP(browserPC, agentConn?.browserCandidates);
        console.log(`✅ Browser offer handled for agent ${agentId}`);
        return { agentId, sdp: finalBrowserSDP, sdpType: "answer", status: "agent_answer_created" };
    }

    if (event === "browser_terminate") {
        removeAgentConnection(agentId);
        console.log(`👋 Agent ${agentId} removed`);
        return { status: "agent_removed" };
    }

    return { status: "no_event_match" };
}
