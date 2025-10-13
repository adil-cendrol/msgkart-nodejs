import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { handleBrowserConnection } from "./webrtc/browserHandler.mjs";
import { handleMetaConnection } from "./webrtc/metaHandler.mjs";
import { PORT } from "./config/env.js";

const app = express();
app.use(express.json());

app.post("/api/backend2-event", async (req, res) => {
    const { eventType, callId, sdp, businessId, agentId } = req.body;
    const browserWs = getBrowserWs(businessId, agentId); // your browser WS map

    try {
        const result = await handleMetaConnect({ eventType, callId, sdp, browserWs });
        res.json(result);
    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Start Express server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Browser WS map
const browserConnections = new Map();

server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("🌐 Browser WS connected");
        ws.on("message", async (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.event_type === "init_browser") {
                    const { businessId, agentId } = data;
                    const key = `${businessId}_${agentId}`;
                    browserConnections.set(key, ws);
                    console.log(`✅ Browser registered: ${key}`);
                    handleBrowserConnection(ws);
                }
            } catch (err) {
                console.error("❌ Error parsing browser WS message:", err);
            }
        });
    });
});
function getBrowserWs(businessId, agentId) {
    return browserConnections.get(`${businessId}_${agentId}`);
}

server.listen(PORT, () => console.log(`🚀 Backend1 listening on port ${PORT}`));
