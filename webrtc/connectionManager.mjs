let activeBrowserWs = null;
let activeMetaWs = null;
let activeBrowserPC = null;
let activeMetaPC = null;

export function setMetaConnection(ws, pc) {
    activeMetaWs = ws;
    activeMetaPC = pc;
}

export function setBrowserConnection(ws, pc) {
    activeBrowserWs = ws;
    activeBrowserPC = pc;
}

export function getConnections() {
    return { activeBrowserWs, activeMetaWs, activeBrowserPC, activeMetaPC };
}

export function clearConnections() {
    activeBrowserWs = null;
    activeMetaWs = null;
    activeBrowserPC = null;
    activeMetaPC = null;
}

export function hangupCall() {
    console.log("🚫 Hanging up call and clearing connections...");

    try {
        if (activeBrowserPC) {
            activeBrowserPC.close();
            console.log("🧹 Closed Browser PeerConnection");
        }
        if (activeMetaPC) {
            activeMetaPC.close();
            console.log("🧹 Closed Meta PeerConnection");
        }
    } catch (err) {
        console.error("❌ Error closing PeerConnections:", err);
    }
    clearConnections();
    import("../audio/audioMixer.mjs").then(({ stopRecording }) => {
        stopRecording();
    }).catch(() => { });

    console.log("✅ Call cleanup complete")
}