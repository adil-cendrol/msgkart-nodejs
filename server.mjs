import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { handleBrowserConnection } from "./webrtc/browserSocket.mjs";
import { handleMetaConnection } from "./webrtc/metaSocket.mjs";
import { PORT } from "./config/env.js";

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });   // Browser
const metaUrl = "wss://464lquf5o3.execute-api.ap-south-1.amazonaws.com/production?auth_token=eyJraWQiOiJIWFpUZWlNRWRSeHl4dWtTbUt1MXNTSm9xd1FRSXl6R1NQd3hWNlZQRHZrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI1MGE1YWIwNy04MTExLTRlYTQtOTY4OC0zMWVjMWJkZTgzMjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xX1JBa256a3FXRCIsImNsaWVudF9pZCI6IjdiNjI2NTByMWJra2g0N2dwajgzcWdwNWQ0Iiwib3JpZ2luX2p0aSI6Ijg0NDYwNGI1LTM5ZDYtNDg2ZS1hODMyLWQ1Y2QwNDY4YWE1YSIsImV2ZW50X2lkIjoiYjg2ODc2NGUtNTU2NS00N2JmLTg5ZjctMzRmOGUwMzdhMzAwIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc2MDE2MDQyNCwiZXhwIjoxNzYwMjQ2ODI0LCJpYXQiOjE3NjAxNjA0MjQsImp0aSI6IjllMWIxN2ZhLWYzMTEtNDE3ZS1hMGUxLWY3MDZjZTViNGU2MCIsInVzZXJuYW1lIjoiNTBhNWFiMDctODExMS00ZWE0LTk2ODgtMzFlYzFiZGU4MzIyIn0.M7QrZ7jTeceLyPds_FjkG8GiVL-MnljVXfIJyqKUiH4pvl0ZM_ebmUxKG4fSaDdfDzYZxU00eoQ1YQ80dsF86OPNPE4PQTgRV34iewW2fD4yq7A0Y4WZHRPmmt-H9l0xU7PdF7UGC302mfmzQHzJQh7YqaDOr126kK35BMNrXkeY8cVnsvIea7fcdIapUUVvMWrEmsRDoQaxHfTR-D9Vc34PzDHgsbq2joQjkNvt1Y23WGhAmULhtYTZbBHR6wagjpZCGb0LuNwiLXQsDUexmOrMjLpx26ICbp6L-vxR8wa4BuNjtkJ-r-jjBbu59kO3O9t8NFM6mT9RvJrd_Li4YQ";

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
