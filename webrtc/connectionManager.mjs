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

export function clearPCs() {
    try {
        if (activeBrowserPC) {
            try { activeBrowserPC.getSenders().forEach(s => s.track && s.track.stop()); } catch (e) { }
            activeBrowserPC.close();
            console.log("🧹 Closed Browser PeerConnection");
        }
    } catch (err) {
        console.error("❌ Error closing Browser PC:", err);
    }

    try {
        if (activeMetaPC) {
            try { activeMetaPC.getSenders().forEach(s => s.track && s.track.stop()); } catch (e) { }
            activeMetaPC.close();
            console.log("🧹 Closed Meta PeerConnection");
        }
    } catch (err) {
        console.error("❌ Error closing Meta PC:", err);
    }

    activeBrowserPC = null;
    activeMetaPC = null;
}

export function hangupCall() {
    console.log("🚫 Hanging up call and clearing connections...");
    // clearPCs();
    import("../audio/audioMixer.mjs").then(({ stopRecording }) => {
        stopRecording();
    }).catch(() => { });

    console.log("✅ Call cleanup complete")
}