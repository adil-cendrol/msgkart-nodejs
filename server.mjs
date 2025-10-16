import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { PORT } from "./config/env.js";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
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

app.post("/api/v1/webrtc/connect", async (req, res) => {
    console.log(req.body, "req body")
    try {
        const result = await handleBrowserConnection(req.body);
        res.json(result);
    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).json({ error: err.message });
    }
})



// // Start Express server
app.listen(PORT, () => console.log(`🚀 Backend1 listening on port ${PORT}`));


