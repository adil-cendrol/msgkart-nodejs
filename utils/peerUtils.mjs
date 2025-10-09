import { RTCPeerConnection } from "werift";

export async function createPeerConnection(direction = "sendrecv") {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  pc.addTransceiver("audio", { direction });
  const candidates = [];
  pc.onicecandidate = (event) => {
    if (event.candidate) candidates.push(event.candidate);
  };  
  return { pc, candidates };
}

export function finalizeSDP(pc, candidates) {
  let sdp = pc.localDescription.sdp;
  const srflx = candidates.find(c => c.candidate.includes("typ srflx"));
  if (srflx) {
    const match = srflx.candidate.match(/\d+\.\d+\.\d+\.\d+/);
    if (match) {
      const ip = match[0];
      sdp = sdp.replace(/c=IN IP4 0\.0\.0\.0/g, `c=IN IP4 ${ip}`);
      console.log("🌍 SDP public IP replaced with:", ip);
    }
  }
  return sdp;
}
