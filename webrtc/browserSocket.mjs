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
    pendingTracks,
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

        // // ✅ Always attach ontrack listener once
        // if (!browserPC._ontrackSet) {
        //     browserPC._ontrackSet = true;
        //     browserPC.ontrack = (ev) => {
        //         try {
        //             const track = ev.track;
        //             const callId = getCallIdByAgent(agentId);
        //             const callConn = getCallConnection(callId);
        //             const metaPC = callConn?.metaPC;

        //             console.log(`📶 Browser ontrack (agent ${agentId}, call ${callId})`);
        //             console.log(`🎯  ontrack triggered → agent=${agentId}, callId=${callId}, trackKind=${track.kind}`);
        //             if (track.kind === "audio" && metaPC) {
        //                 metaPC.addTrack(track);
        //                 browserReady(callId, track);
        //                 console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
        //                 if (track.onReceiveRtp) {
        //                     track.onReceiveRtp.subscribe((rtp) => {
        //                         console.log("📥 RTP from browser:", rtp.header.timestamp);
        //                     });
        //                 }
        //             } else {
        //                 console.warn(`⚠️ No metaPC found or invalid track kind for agent ${agentId}`);
        //             }
        //         } catch (err) {
        //             console.error(`❌ Error in browser ontrack for agent ${agentId}:`, err);
        //         }
        //     };
        // }

        if (!browserPC._ontrackSet) {
            browserPC._ontrackSet = true;
            browserPC.ontrack = (ev) => {
                try {
                    const track = ev.track;
                    const callId = getCallIdByAgent(agentId);
                    const callConn = getCallConnection(callId);
                    const metaPC = callConn?.metaPC;

                    if (track.kind === "audio") {
                        if (metaPC) {
                            // Meta is ready → bridge immediately
                            metaPC.addTrack(track);
                            browserReady(callId, track);
                            console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
                        } else {
                            // Meta not ready → store pending
                            if (!pendingTracks.has(agentId)) pendingTracks.set(agentId, []);
                            pendingTracks.get(agentId).push(track);
                            console.log(`⏳ Browser audio track pending for agent ${agentId}`);
                        }
                    }
                } catch (err) {
                    console.error(`❌ Error in browser ontrack for agent ${agentId}:`, err);
                }
            };
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
