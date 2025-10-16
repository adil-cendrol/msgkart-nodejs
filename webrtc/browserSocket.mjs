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

export async function handleBrowserConnection(response) {
    try {
        const { event, agentId, sdp } = response;
        if (!agentId) return { status: "missing_agent" };
        if (!event) return { status: "event_missing" }
        if (event === "browser_offer_sdp") {
            if (!sdp) return { status: "sdp_missing" };
            try {
                let agentConn = getAgentConnection(agentId);
                // create peer connection if not already present
                if (!agentConn?.browserPC) {
                    try {
                        const { pc: browserPC, candidates: browserCandidates } =
                            await createPeerConnection("sendrecv");
                        createBrowserConnection(agentId, browserPC, browserCandidates);
                        agentConn = getAgentConnection(agentId);
                        // setup track listener
                        browserPC.ontrack = (ev) => {
                            try {
                                const track = ev.track;
                                const callId = getCallIdByAgent(agentId);
                                const callConn = getCallConnection(callId);
                                const metaPC = callConn?.metaPC;

                                if (track.kind === "audio" && metaPC) {
                                    metaPC.addTrack(track);
                                    browserReady(callId, track);
                                    console.log(
                                        `🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`
                                    );
                                } else {
                                    console.warn(`⚠️ No metaPC found for agent ${agentId}`);
                                }
                            } catch (err) {
                                console.error(
                                    `❌ Error during browser ontrack for agent ${agentId}:`,
                                    err
                                );
                            }
                        };
                    } catch (err) {
                        console.error(`❌ Error creating PeerConnection for ${agentId}:`, err);
                    }
                }
                // set remote offer SDP
                try {
                    const agentBrowserPC = getAgentConnection(agentId)?.browserPC;
                    if (!agentBrowserPC)
                        throw new Error("browserPC not found for agent " + agentId);
                    await agentBrowserPC.setRemoteDescription({ type: "offer", sdp });
                } catch (err) {
                    console.error(`❌ Failed to set remote offer SDP:`, err);
                }

                // create answer SDP
                let finalBrowserSDP = null;
                try {
                    const agentBrowserPC = getAgentConnection(agentId)?.browserPC;
                    const answer = await agentBrowserPC.createAnswer();
                    await agentBrowserPC.setLocalDescription(answer);
                    finalBrowserSDP = finalizeSDP(
                        agentBrowserPC,
                        getAgentConnection(agentId)?.browserCandidates
                    );
                    console.log(`✅ Browser offer handled successfully for agent ${agentId}`);
                } catch (err) {
                    console.error(`❌ Failed to create or finalize answer SDP:`, err);
                }

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

        // --- Handle agent removal ---
        if (event === "browser_terminate") {
            try {
                const listOfAgents = listAgentIds();
                removeAgentConnection(agentId);
                console.log(`👋 Agent ${agentId} removed`);
                console.log("Available agents:", listOfAgents);
                return { status: "agent_removed" };
            } catch (err) {
                console.error(`❌ Error removing agent ${agentId}:`, err);
                return { status: "error_removing_agent", message: err.message };
            }
        }

        return { status: "no_event_match" };
    } catch (err) {
        console.error(`❌ Global error in handleBrowserConnection:`, err);
        return { status: "fatal_error", message: err.message };
    }
}
