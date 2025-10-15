import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { PORT } from "./config/env.js";
// import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";

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



// // Start Express server
// const server = http.createServer(app);
// const wss = new WebSocketServer({ noServer: true });

// // Browser WS map
// const browserConnections = new Map();

// server.on("upgrade", (req, socket, head) => {
//     if (req.url === "/ws") {
//         wss.handleUpgrade(req, socket, head, (ws) => {
//             console.log("🌐 Browser WS connected");
//             ws.on("message", async (msg) => {
//                 try {
//                     const data = JSON.parse(msg.toString());
//                     if (data.event_type === "init_browser") {
//                         const { businessId, agentId } = data;
//                         const key = `${businessId}_${agentId}`;
//                         browserConnections.set(key, ws);
//                         console.log(`✅ Browser registered: ${key}`);
//                         handleBrowserConnection(ws);
//                     }
//                 } catch (err) {
//                     console.error("❌ Error parsing browser WS message:", err);
//                 }
//             });
//         });
//     }
// });



// function getBrowserWs(businessId, agentId) {
//     return browserConnections.get(`${businessId}_${agentId}`);
// }

app.listen(PORT, () => console.log(`🚀 Backend1 listening on port ${PORT}`));


