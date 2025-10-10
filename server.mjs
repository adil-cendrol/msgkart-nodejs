import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";
import { PORT } from "./config/env.js";

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });   // Browser
const metaUrl = "wss://464lquf5o3.execute-api.ap-south-1.amazonaws.com/production?auth_token=eyJraWQiOiJIWFpUZWlNRWRSeHl4dWtTbUt1MXNTSm9xd1FRSXl6R1NQd3hWNlZQRHZrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI1MGE1YWIwNy04MTExLTRlYTQtOTY4OC0zMWVjMWJkZTgzMjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xX1JBa256a3FXRCIsImNsaWVudF9pZCI6IjdiNjI2NTByMWJra2g0N2dwajgzcWdwNWQ0Iiwib3JpZ2luX2p0aSI6IjhmZjcyOWUxLTRiYTUtNDk4YS1iNzkyLTJmYTNhOWVkODBkZiIsImV2ZW50X2lkIjoiYTI0YTU3YWUtZTQxMS00ZDk2LTk3NzItMDE2MWFlNjNiNjBlIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc2MDA4ODU3OCwiZXhwIjoxNzYwMTc0OTc4LCJpYXQiOjE3NjAwODg1NzgsImp0aSI6IjcyNzMzN2E2LTk2OWYtNDY5MC1iNTAyLTI5ZTg0ZTRlMTk1OCIsInVzZXJuYW1lIjoiNTBhNWFiMDctODExMS00ZWE0LTk2ODgtMzFlYzFiZGU4MzIyIn0.gfDJu8RB5pV8x7tiaTafFc5Y_7s2JyJhXC9efDyMBFGztmrnW3LEc9dgzqg9PqbqmcdQYyvSZiFI5yFvD46HUnMOBL6fl6KutxQ7Q6O1PyAmvcIhKY6wv_mSXmvDKpQP2FT-rK0KuGU8NJnrwkc1FM4MBoPSKyGHxDy-P621kudMC4uDjxpDWfK5nNYic9Cx4W1jZMuow-hr1CtHTxx31mEdpB9v1BAjR6oDWJQERVOq3npjU50MA65gl6l0Doz_lkVRlqQuEQuGTowIXniwunPFtAV-fkdnItjiwdIOS5nkq57ZPBFWpNaWfX2-v_eDYL5LLadCOVFs2JQlNGVltA";

const metaWs = new WebSocket(metaUrl);


metaWs.on("open", () => {
    console.log("✅ Connected to GoLang backend WebSocket!");
    handleMetaConnection(metaWs);
});



server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => handleBrowserConnection(ws));
});

server.listen(PORT, "0.0.0.0", () =>
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`)
);
