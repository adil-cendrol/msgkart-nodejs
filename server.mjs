
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";
import { PORT } from "./config/env.js";

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

const browserConnections = new Map();
let activeMetaWs = null;

function getBrowserConnection(businessId, agentId) {
    return browserConnections.get(`${businessId}_${agentId}`);
}
function getAllBrowserConnections() {
    return browserConnections;
}
function getActiveMetaWs() {
    return activeMetaWs;
}

// 🧠 Browser connects
server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("🌐 New browser WebSocket connection established");
        ws.on("message", (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.event_type === "init_browser") {
                    const { agentId, businessId } = data;
                    const key = `${businessId}_${agentId}`;
                    browserConnections.set(key, ws);
                    console.log(`✅ Browser registered for ${key}`);
                    handleBrowserConnection(ws, getActiveMetaWs);
                }
            } catch (err) {
                console.error("❌ Error parsing browser message:", err);
            }
        });
    });
});

// 🧠 Meta connects
const metaUrl = "ws://localhost:8086/meta";
const metaWs = new WebSocket(metaUrl);

metaWs.on("open", () => {
    console.log("✅ Connected to Meta backend");
    activeMetaWs = metaWs;
    handleMetaConnection(metaWs, getBrowserConnection);
});

server.listen(PORT, "0.0.0.0", () =>
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
);
