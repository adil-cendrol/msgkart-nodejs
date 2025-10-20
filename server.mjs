import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { PORT } from "./config/env.js";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";
import { agents, agentToCall, calls } from "./webrtc/connectionManager.mjs";


const app = express();
app.use(express.json());

app.post("/api/webrtc/session-init", async (req, res) => {
    console.log(req.body, "req body")
    try {
        const result = await handleMetaConnection(req.body);
        res.json(result);
    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/v1/webrtc/connect", async (req, res) => {
    console.log(req.body, "req body");
    try {
        const result = await handleBrowserConnection(req.body);
        // Map status to proper HTTP status codes
        let httpStatus = 200; // default
        switch (result.status) {
            case "missing_agent":
            case "no_event_match":
            case "event_missing":
            case "sdp_missing":
                httpStatus = 400; // Bad Request
                break;
            case "error":
            case "error_removing_agent":
                httpStatus = 500; // Internal Server Error
                break;
            case "fatal_error":
                httpStatus = 500; // Internal Server Error
                break;
            case "agent_answer_created":
            case "agent_removed":
                httpStatus = 200; // OK
                break;
            default:
                httpStatus = 500;
        }

        res.status(httpStatus).json(result);
    } catch (err) {
        console.error("❌ Unexpected error:", err);
        res.status(500).json({ status: "fatal_error", message: err.message });
    }
});

app.get("/api/webrtc/active-calls", (req, res) => {
    const summary = {};

    for (const [agentId, callId] of agentToCall.entries()) {
        if (!summary[callId]) summary[callId] = [];
        summary[callId].push(agentId);
    }

    const result = Object.entries(summary).map(([callId, agents]) => ({
        callId,
        totalAgents: agents.length,
        agents
    }));

    res.json({ activeCalls: result });
});
// 🧮 Get
//  agents connected to a specific call
app.get("/api/webrtc/agents-by-call/:callId", (req, res) => {
    const { callId } = req.params;

    // Find all agent IDs mapped to this call
    const connectedAgents = [...agentToCall.entries()]
        .filter(([agentId, cId]) => cId === callId)
        .map(([agentId]) => agentId);

    res.json({
        callId,
        totalAgents: connectedAgents.length,
        agents: connectedAgents
    });
});

// 🧩 Get call details based on a specific agent ID
app.get("/api/webrtc/call-by-agent/:agentId", (req, res) => {
    const { agentId } = req.params;

    // Check if agent exists in mapping
    const callId = agentToCall.get(agentId);

    if (!callId) {
        return res.status(404).json({
            agentId,
            message: "Agent is not currently mapped to any active call."
        });
    }

    // Find all agents currently in the same call
    const agentsInSameCall = [...agentToCall.entries()]
        .filter(([aId, cId]) => cId === callId)
        .map(([aId]) => aId);

    res.json({
        agentId,
        callId,
        totalAgentsInSameCall: agentsInSameCall.length,
        agentsInSameCall
    });
});
// 🧮 Get total active agents (across all calls)
app.get("/api/webrtc/total-active-agents", (req, res) => {
    const activeAgents = [...agents.entries()]
        .filter(([_, conn]) => conn?.browserPC)
        .map(([agentId, conn]) => ({
            agentId,
            connectionState: conn.browserPC.connectionState || "unknown"
        }));

    res.json({
        totalAgents: activeAgents.length,
        agents: activeAgents
    });
});




// // Start Express server
app.listen(PORT, () => console.log(`🚀 Backend1 listening on port ${PORT}`));


