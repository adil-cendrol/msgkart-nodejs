import { browserReady } from "../audio/audioMixer.mjs";
import { finalizeSDP, createPeerConnection } from "../utils/peerUtils.mjs";
import { createBrowserConnection, getAgentConnection, listAgentIds, removeAgentConnection } from "./connectionManager.mjs";
export async function handleBrowserConnection(response) {
    const { eventType, agentId } = response
    // ---------- Agent (browser) offer: create or reuse agent's browserPC ----------
    if (eventType === "agentOffer") {
        if (!agentId) return { status: "missing_agent" };
        let agentConn = getAgentConnection(agentId);
        if (!agentConn?.browserPC) {
            const { pc: browserPC, candidates: browserCandidates } = await createPeerConnection("sendrecv");
            createBrowserConnection(agentId, browserPC, browserCandidates);
            agentConn = getAgentConnection(agentId);

            // browser -> meta bridging on track
            if (browserPC.onTrack) {
                browserPC.onTrack.subscribe((track) => {
                    if (track.kind === "audio" && metaPC) {
                        try {
                            metaPC.addTrack(track);
                            browserReady(callId, track);
                            console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);

                        } catch (err) {
                            console.warn("bridge browser->meta failed:", err?.message || err);
                        }
                    } else {
                        browserReady(callId, track);
                    }
                });
            } else if (browserPC.ontrack !== undefined) {
                browserPC.ontrack = (ev) => {
                    const track = ev.track;
                    if (track.kind === "audio" && metaPC) {
                        try {
                            metaPC.addTrack(track);
                            browserReady(callId, track);
                            console.log(`🎤 Browser audio bridged → Meta (call ${callId}, agent ${agentId})`);
                        } catch (err) {
                            console.warn("bridge browser->meta failed:", err?.message || err);
                        }
                    } else {
                        browserReady(callId, track);
                    }
                };
            }
        }
        const agentBrowserPC = getAgentConnection(agentId).browserPC;
        await agentBrowserPC.setRemoteDescription({ type: "offer", sdp });
        const answer = await agentBrowserPC.createAnswer();
        await agentBrowserPC.setLocalDescription(answer);
        const finalBrowserSDP = finalizeSDP(agentBrowserPC, getAgentConnection(agentId)?.browserCandidates);
        return { callId, agentId, sdp: finalBrowserSDP, status: "agent_answer_created" };
    }

    if (eventType === "agentAnswer") {
        if (!agentId) return { status: "missing_agent" };
        const agentConn = getAgentConnection(agentId);
        if (agentConn?.browserPC) {
            await agentConn.browserPC.setRemoteDescription({ type: "answer", sdp });
            console.log(`✅ Browser PC remote description set for agent ${agentId}`);
        }
        return { status: "agent_answer_set" };
    }

    if (event === "agent_removed") {
        const listofAgent = listAgentIds()
        removeAgentConnection(agentId);
        console.log(`👋 Agent ${agentId} removed`);
        console.log(listofAgent, "list of avaibale agent is there")
        return { status: "agent_removed" };
    }
}
