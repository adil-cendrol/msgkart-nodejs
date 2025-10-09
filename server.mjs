import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";
import { PORT } from "./config/env.js";

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });   // Browser
const metaUrl = "wss://464lquf5o3.execute-api.ap-south-1.amazonaws.com/production?auth_token=eyJraWQiOiJIWFpUZWlNRWRSeHl4dWtTbUt1MXNTSm9xd1FRSXl6R1NQd3hWNlZQRHZrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI1MGE1YWIwNy04MTExLTRlYTQtOTY4OC0zMWVjMWJkZTgzMjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xX1JBa256a3FXRCIsImNsaWVudF9pZCI6IjdiNjI2NTByMWJra2g0N2dwajgzcWdwNWQ0Iiwib3JpZ2luX2p0aSI6IjYxM2VmNmI3LWM0NjEtNGNkZS1hMDdiLWE4MDkwZmQzYzViZSIsImV2ZW50X2lkIjoiYjBmZDc2OTktMjU1ZC00Nzc5LTlkMjMtOTcxYjI5NmExMDAwIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc1OTk5NTMxNSwiZXhwIjoxNzYwMDgxNzE1LCJpYXQiOjE3NTk5OTUzMTYsImp0aSI6Ijk0NTBhNDJhLWEzZmEtNDFhZi1iYmNmLWMxMDUzMDYyZjI3ZSIsInVzZXJuYW1lIjoiNTBhNWFiMDctODExMS00ZWE0LTk2ODgtMzFlYzFiZGU4MzIyIn0.r51TZugIYjfVKBuaFIIBvsMTWm6HKP_gjUp-jbIKXDgUyzZFHtqI45TMPCXz9etIEgp_fhtfsyNQBIgbEo_j-MJR0ufJwJxMrf_wLTltxJxwEEaypwisE52kaX3sMKUDebChMUxRHJ76g_fPv4jRb8lvgBHCvHy3v5xl7s9fFLE2p2XggPrUqqyEdcfLpNERwL2u6N1_x98_tbUGNU9nlpym9ckQ_Php0v0M6Pd4BXHTxVwMjSN1lS_dLdNusHX_3sRyoxQhbrH6jK1Tq2esbf2WNGCR8P-abTAYx9L5pDG0RqeI6TQHLdPhn5RGlTOGp_QNbEqucqA8Qg5u8GQLvw";

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
