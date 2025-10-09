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
