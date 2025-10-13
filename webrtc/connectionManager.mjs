// // connectionManager.mjs
// export const connections = new Map(); // uuid -> { metaPC, browserPC, metaWS, browserWS }

// export function createMetaConnection(uuid, ws, pc) {
//   if (!connections.has(uuid)) connections.set(uuid, {});
//   const conn = connections.get(uuid);
//   conn.metaPC = pc;
//   conn.metaWS = ws;
//   connections.set(uuid, conn);
// }

// export function createBrowserConnection(uuid, ws, pc) {
//   if (!connections.has(uuid)) connections.set(uuid, {});
//   const conn = connections.get(uuid);
//   conn.browserPC = pc;
//   conn.browserWS = ws;
//   connections.set(uuid, conn);
// }

// export function getConnection(uuid) {
//   return connections.get(uuid);
// }

// export function getConnectionByWs(ws) {
//   for (const [uuid, conn] of connections.entries()) {
//     if (conn.metaWS === ws || conn.browserWS === ws) {
//       return { uuid, conn };
//     }
//   }
//   return null;
// }

// export function removeConnection(uuid) {
//   const conn = connections.get(uuid);
//   if (!conn) return;

//   try { conn.metaPC?.close(); } catch { }
//   try { conn.browserPC?.close(); } catch { }
//   try { conn.metaWS?.close(); } catch { }
//   try { conn.browserWS?.close(); } catch { }

//   connections.delete(uuid);
//   console.log(`🗑️ Connection ${uuid} removed`);
// }

// export function hangupCall(uuid) {
//   console.log(`🚫 Hanging up call for UUID ${uuid}`);
//   removeConnection(uuid);
// }


// let activeBrowserWs = null;
// let activeMetaWs = null;
// let activeBrowserPC = null;
// let activeMetaPC = null;

// export function setMetaConnection(ws, pc) {
//   activeMetaWs = ws;
//   activeMetaPC = pc;
// }

// export function setBrowserConnection(ws, pc) {
//   activeBrowserWs = ws;
//   activeBrowserPC = pc;
// }
// export function getConnections() {
//   return { activeBrowserWs, activeMetaWs, activeBrowserPC, activeMetaPC };
// }


export const connections = new Map();

export function createMetaConnection(uuid, ws, pc) {
  if (!connections.has(uuid)) connections.set(uuid, {});
  const conn = connections.get(uuid);
  conn.metaPC = pc;
  conn.metaWS = ws;
  connections.set(uuid, conn);
}

export function createBrowserConnection(uuid, ws, pc) {
  if (!connections.has(uuid)) connections.set(uuid, {});
  const conn = connections.get(uuid);
  conn.browserPC = pc;
  conn.browserWS = ws;
  connections.set(uuid, conn);
}

export function getConnection(uuid) {
  return connections.get(uuid);
}

export function setMetaConnection(ws, pc) {
  let dummyUuid = "active_meta";
  if (!connections.has(dummyUuid)) connections.set(dummyUuid, {});
  const conn = connections.get(dummyUuid);
  conn.metaPC = pc;
  conn.metaWS = ws;
}

export function setBrowserConnection(ws, pc) {
  let dummyUuid = "active_browser";
  if (!connections.has(dummyUuid)) connections.set(dummyUuid, {});
  const conn = connections.get(dummyUuid);
  conn.browserPC = pc;
  conn.browserWS = ws;
}

export function getConnections() {
  return connections.get("active_meta") || {};
}
