import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../../../packages/contracts";
const api: DesktopAPI = {
  exportReport: (id, scope, settings) =>
    ipcRenderer.invoke("pam:report-export", id, scope, settings),
  saveVideo: (id, data, metadata) =>
    ipcRenderer.invoke("pam:video-save", id, data, metadata),
  exportStudy: (id, format) =>
    ipcRenderer.invoke("pam:study-export", id, format),
  exportBenchmark: (runIds, settings, format) =>
    ipcRenderer.invoke("pam:benchmark-export", runIds, settings, format),
  importCT: () => ipcRenderer.invoke("pam:ct-import"),
  ctArray: (config) => ipcRenderer.invoke("pam:ct-array", config),
  request: (action, payload) =>
    ipcRenderer.invoke("pam:request", action, payload),
  array: (runId, kind, channel = 0) =>
    ipcRenderer.invoke("pam:array", runId, kind, channel),
  project: (create, name) => ipcRenderer.invoke("pam:project", create, name),
  exportBundle: (runId, includeRaw) =>
    ipcRenderer.invoke("pam:export", runId, includeRaw),
  importBundle: () => ipcRenderer.invoke("pam:import"),
  exportRF: (runId, kind, channel, signal = "raw") =>
    ipcRenderer.invoke("pam:exportRF", runId, kind, channel, signal),
};
contextBridge.exposeInMainWorld("pam", Object.freeze(api));
