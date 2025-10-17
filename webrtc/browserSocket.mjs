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

        const callId = getCallIdByAgent(agentId);
        const callConn = getCallConnection(callId);
        const metaPC = callConn?.metaPC;

        // ✅ Attach ontrack listener once (for remote tracks in the future)
        if (!browserPC._ontrackSet) {
            browserPC._ontrackSet = true;
            browserPC.ontrack = (ev) => {
                try {
                    const track = ev.track;
                    const callId = getCallIdByAgent(agentId);
                    const callConn = getCallConnection(callId);
                    const metaPC = callConn?.metaPC;

                    console.log(`📶 Browser ontrack (agent ${agentId}, call ${callId})`);
                    console.log(`🎯 ontrack triggered → agent=${agentId}, callId=${callId}, trackKind=${track.kind}`);

                    if (track.kind === "audio" && metaPC) {
                        const alreadyAdded = metaPC.getSenders().some(s => s.track === track);
                        if (!alreadyAdded) {
                            metaPC.addTrack(track);
                            browserReady(callId, track);
                            console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
                        }
                    } else {
                        console.warn(`⚠️ No metaPC found or invalid track kind for agent ${agentId}`);
                    }
                } catch (err) {
                    console.error(`❌ Error in browser ontrack for agent ${agentId}:`, err);
                }
            };
        }

        // ✅ Manually bridge already-existing browser tracks to metaPC
        if (metaPC) {
            browserPC.getSenders().forEach(sender => {
                const track = sender.track;
                if (track && track.kind === "audio") {
                    const alreadyAdded = metaPC.getSenders().some(s => s.track === track);
                    if (!alreadyAdded) {
                        metaPC.addTrack(track);
                        browserReady(callId, track);
                        console.log(`🎤 Existing browser audio manually bridged → Meta (call ${callId}, agent ${agentId})`);
                    }
                }
            });
        }

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
