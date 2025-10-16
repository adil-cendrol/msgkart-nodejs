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
 * Express route handler version of handleBrowserConnection
 * @param {Request} req - Express request (expects body with event, agentId, sdp)
 * @param {Response} res - Express response
 */
export async function handleBrowserConnection(req, res) {
    try {
        const { event, agentId, sdp } = req.body || {};

        // ✅ Validate required fields
        if (!event || !agentId) {
            console.warn("⚠️ Missing required fields:", req.body);
            return res.status(400).json({
                status: "error",
                message: "Invalid payload: event or agentId missing",
            });
        }

        if (event === "browser_offer_sdp" && !sdp) {
            console.warn("⚠️ Missing SDP in browser_offer_sdp:", req.body);
            return res.status(400).json({
                status: "error",
                message: "Invalid payload: SDP missing for browser_offer_sdp",
            });
        }

        // --- Handle browser offer SDP ---
        if (event === "browser_offer_sdp") {
            try {
                let agentConn = getAgentConnection(agentId);

                // Create PeerConnection if not already present
                if (!agentConn?.browserPC) {
                    try {
                        const { pc: browserPC, candidates: browserCandidates } =
                            await createPeerConnection("sendrecv");
                        createBrowserConnection(agentId, browserPC, browserCandidates);
                        agentConn = getAgentConnection(agentId);

                        // Track listener setup
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

                // Set remote offer SDP
                try {
                    const agentBrowserPC = getAgentConnection(agentId)?.browserPC;
                    if (!agentBrowserPC)
                        throw new Error("browserPC not found for agent " + agentId);
                    await agentBrowserPC.setRemoteDescription({ type: "offer", sdp });
                } catch (err) {
                    console.error(`❌ Failed to set remote offer SDP:`, err);
                }

                // Create answer SDP
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

                return res.status(200).json({
                    status: "success",
                    agentId,
                    sdp: finalBrowserSDP,
                    sdpType: "answer",
                    message: "agent_answer_created",
                });
            } catch (err) {
                console.error(`❌ Error handling browser_offer_sdp for ${agentId}:`, err);
                return res.status(500).json({ status: "error", message: err.message });
            }
        }

        // --- Handle agent removal ---
        if (event === "agent_removed") {
            try {
                const listOfAgents = listAgentIds();
                removeAgentConnection(agentId);
                console.log(`👋 Agent ${agentId} removed`);
                console.log("Available agents:", listOfAgents);
                return res.status(200).json({ status: "success", message: "agent_removed" });
            } catch (err) {
                console.error(`❌ Error removing agent ${agentId}:`, err);
                return res.status(500).json({ status: "error", message: err.message });
            }
        }

        // Unknown event
        return res.status(400).json({
            status: "error",
            message: "Unknown event type",
        });
    } catch (err) {
        console.error(`❌ Global error in handleBrowserConnection:`, err);
        return res.status(500).json({ status: "fatal_error", message: err.message });
    }
}
