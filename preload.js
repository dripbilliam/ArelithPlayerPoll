// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  authGet: () => ipcRenderer.invoke("auth:get"),
  authSet: (token) => ipcRenderer.invoke("auth:set", token),
  pollNow: () => ipcRenderer.invoke("poll:now"),
  // stats/listing removed in live-only build
  onPlayersUpdate: (handler) => {
    ipcRenderer.removeAllListeners("players-update");
    ipcRenderer.on("players-update", (_e, payload) => handler?.(payload));
  },
  isDevMode: () => ipcRenderer.invoke("dev:is-enabled"),
  simulateUpdate: () => ipcRenderer.invoke("dev:simulate-update"),
});
