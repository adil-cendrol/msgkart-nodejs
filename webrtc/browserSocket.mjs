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
        const { event, agentId, sdp } = response || {};
        // ✅ Early validation for missing or invalid fields
        if (!event || !agentId) {
            console.warn("⚠️ Missing required fields in response:", response);
            return {
                status: 400,
                message: "Invalid payload: event or agentId missing",
            };
        }

        if (event === "browser_offer_sdp" && !sdp) {
            console.warn("⚠️ Missing SDP in browser_offer_sdp:", response);
            return {
                status: 400,
                message: "Invalid payload: SDP missing for browser_offer_sdp",
            };
        }

        if (event === "browser_offer_sdp") {
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
                    status: 200,
                    agentId,
                    sdp: finalBrowserSDP,
                    sdpType: "answer",
                    message: "agent_answer_created",
                };
            } catch (err) {
                console.error(`❌ Error handling browser_offer_sdp for ${agentId}:`, err);
                return { status: 500, message: err.message };
            }
        }

        // --- Handle agent removal ---
        if (event === "agent_removed") {
            try {
                const listOfAgents = listAgentIds();
                removeAgentConnection(agentId);
                console.log(`👋 Agent ${agentId} removed`);
                console.log("Available agents:", listOfAgents);
                return { status: 200, message: "agent_removed" };
            } catch (err) {
                console.error(`❌ Error removing agent ${agentId}:`, err);
                return { status: 500, message: err.message };
            }
        }

        return { status: 400, message: "Unknown event type" };
    } catch (err) {
        console.error(`❌ Global error in handleBrowserConnection:`, err);
        return { status: 500, message: err.message };
    }
}
