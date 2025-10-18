import { browserReady } from "../audio/audioMixer.mjs";
import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
import {
    createBrowserConnection,
    getAgentConnection,
    getCallConnection,
    getCallIdByAgent,
    removeAgentConnection
} from "./connectionManager.mjs";

/**
 * Handles browser-side WebRTC connections.
 */
// handleBrowserConnection.mjs
// handleBrowserConnection.mjs - FIX THIS PART
// handleBrowserConnection.mjs - IMPROVE track handling
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
        
        // Set up browser PC track event to store tracks for later forwarding
        browserPC.ontrack = (ev) => {
            const track = ev.track;
            if (track.kind === "audio") {
                console.log(`🎤 Browser audio track received for agent ${agentId} - ID: ${track.id}, State: ${track.readyState}`);
                
                // Store the track in the agent connection for later forwarding
                if (!agentConn.browserTracks) {
                    agentConn.browserTracks = new Set();
                }
                
                // Remove any ended tracks first
                agentConn.browserTracks.forEach(existingTrack => {
                    if (existingTrack.readyState === "ended") {
                        agentConn.browserTracks.delete(existingTrack);
                    }
                });
                
                agentConn.browserTracks.add(track);
                console.log(`💾 Stored browser track. Total stored: ${agentConn.browserTracks.size}`);
                
                // Also try to immediately forward to Meta if call is already mapped
                const callId = getCallIdByAgent(agentId);
                if (callId) {
                    const callConn = getCallConnection(callId);
                    if (callConn?.metaPC) {
                        try {
                            forwardTrackToMetaPC(track, callConn.metaPC, agentId, callId);
                        } catch (err) {
                            console.error(`❌ Error immediately forwarding to Meta:`, err);
                        }
                    }
                }
                
                // Handle track ended
                track.onended = () => {
                    console.log(`🔇 Browser audio track ended for agent ${agentId}`);
                    if (agentConn.browserTracks) {
                        agentConn.browserTracks.delete(track);
                        console.log(`🗑️ Removed ended track. Remaining: ${agentConn.browserTracks.size}`);
                    }
                };
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

// Helper function to forward a single track to Meta PC
function forwardTrackToMetaPC(track, metaPC, agentId, callId) {
    try {
        const metaSenders = metaPC.getSenders();
        const audioSenders = metaSenders.filter(sender => 
            sender.track && sender.track.kind === "audio"
        );

        if (audioSenders.length > 0) {
            // Replace track in existing sender
            const sender = audioSenders[0];
            sender.replaceTrack(track);
            console.log(`🔄 Immediately replaced meta audio track for call ${callId}`);
        } else {
            // Add new track
            metaPC.addTrack(track);
            console.log(`🎤 Immediately added browser audio to Meta for call ${callId}`);
        }
    } catch (err) {
        console.error(`❌ Error in forwardTrackToMetaPC:`, err);
        throw err;
    }
}