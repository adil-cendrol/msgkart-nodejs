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
    console.log(req.body, "req body");
    try {
        const result = await handleBrowserConnection(req.body);
        // Map status to proper HTTP status codes
        let httpStatus = 200; // default
        switch (result.status) {
            case "missing_agent":
            case "no_event_match":
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



// // Start Express server
app.listen(PORT, () => console.log(`🚀 Backend1 listening on port ${PORT}`));


