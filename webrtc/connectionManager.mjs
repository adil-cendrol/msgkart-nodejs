// connectionManager.mjs
export const calls = new Map();   // callId => { metaPC, metaCandidates }
export const agents = new Map();  // agentId => { browserPC, browserCandidates }
export const agentToCall = new Map(); // agentId => callId

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

/** Map agent <-> call */
// export function mapAgentToCall(agentId, callId) {
//   agentToCall.set(agentId, callId);
//   console.log(`🔗 Mapped agent ${agentId} → call ${callId}`);
// }
/** Map agent <-> call safely */
export function mapAgentToCall(agentId, callId) {
  const existingCallId = agentToCall.get(agentId);

  if (existingCallId && existingCallId !== callId) {
    // Agent had a previous call, remove old mapping first
    console.log(`♻️ Agent ${agentId} was mapped to old call ${existingCallId}, removing mapping`);
    agentToCall.delete(agentId);

    // Optionally, cleanup old metaPC if you want:
    // removeCallConnection(existingCallId);
  }

  // Map agent to new call
  agentToCall.set(agentId, callId);
  console.log(`🔗 Mapped agent ${agentId} → call ${callId}`);
}


// FIX THIS FUNCTION - Get callId by agentId
export function getCallIdByAgent(agentId) {
  return agentToCall.get(agentId);
}

// ADD THIS NEW FUNCTION - Get agentId by callId
export function getAgentIdByCall(callId) {
  for (const [agentId, cId] of agentToCall.entries()) {
    if (cId === callId) return agentId;
  }
  return undefined;
}

export function unmapAgent(agentId) {
  agentToCall.delete(agentId);
}

/** Remove only metaPC (call ended) */
// export function removeCallConnection(callId) {
//   const conn = calls.get(callId);
//   if (!conn) return false;
//   try { conn.metaPC?.close?.(); } catch (err) { console.warn(err?.message || err); }
//   calls.delete(callId);
//   // Remove agent mappings linked to this call
//   for (const [agentId, cId] of agentToCall.entries()) {
//     if (cId === callId) agentToCall.delete(agentId);
//   }
//   return true;
// }
/** Remove only metaPC (call ended) */
export function removeCallConnection(callId) {
  const conn = calls.get(callId);
  if (!conn) return false;
  try {
    conn.metaPC?.close?.();
  } catch (err) {
    console.warn(err?.message || err);
  }

  // Remove the call from calls map
  calls.delete(callId);

  // 🧹 Unmap only those agents linked to this specific call
  for (const [agentId, cId] of agentToCall.entries()) {
    if (cId === callId) {
      agentToCall.delete(agentId);
      console.log(`🧹 Unmapped agent ${agentId} from ended call ${callId}`);
    }
  }

  return true;
}


/** Remove agent's browserPC (agent removed/disconnect) */
export function removeAgentConnection(agentId) {
  const conn = agents.get(agentId);
  if (!conn) return false;
  try { conn.browserPC?.close?.(); } catch (err) { console.warn(err?.message || err); }
  agents.delete(agentId);
  agentToCall.delete(agentId);
  return true;
}

export function listCallIds() { return Array.from(calls.keys()); }
export function listAgentIds() { return Array.from(agents.keys()); }