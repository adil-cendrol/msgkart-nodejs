// connectionManager.mjs
export const calls = new Map();   // callId => { metaPC, metaCandidates }
export const agents = new Map();  // agentId => { browserPC, browserCandidates }

/** Meta (per-call) */
export function createMetaConnection(callId, pc, candidates = null) {
  if (!calls.has(callId)) calls.set(callId, {});
  const conn = calls.get(callId);
  conn.metaPC = pc;
  if (candidates) conn.metaCandidates = candidates;
  calls.set(callId, conn);
  return conn;
}

export function getCallConnection(callId) {
  return calls.get(callId);
}

/** Browser (long-lived per agent) */
export function createBrowserConnection(agentId, pc, candidates = null) {
  if (!agents.has(agentId)) agents.set(agentId, {});
  const conn = agents.get(agentId);
  conn.browserPC = pc;
  if (candidates) conn.browserCandidates = candidates;
  agents.set(agentId, conn);
  return conn;
}

export function getAgentConnection(agentId) {
  return agents.get(agentId);
}

/** Remove only metaPC (call ended) */
export function removeCallConnection(callId) {
  const conn = calls.get(callId);
  if (!conn) return false;
  try { conn.metaPC?.close?.(); } catch (err) { console.warn(`close metaPC error:`, err?.message || err); }
  calls.delete(callId);
  return true;
}

/** Remove agent's browserPC (agent removed/disconnect) */
export function removeAgentConnection(agentId) {
  const conn = agents.get(agentId);
  if (!conn) return false;
  try { conn.browserPC?.close?.(); } catch (err) { console.warn(`close browserPC error:`, err?.message || err); }
  agents.delete(agentId);
  return true;
}

export function listCallIds() { return Array.from(calls.keys()); }
export function listAgentIds() { return Array.from(agents.keys()); }
