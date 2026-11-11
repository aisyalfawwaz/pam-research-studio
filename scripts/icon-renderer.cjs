const { app, BrowserWindow } = require("electron");
const { readFileSync } = require("node:fs");
const path = require("node:path");
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 512, height: 512, useContentSize: true, frame: false, show: false, transparent: true, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
  const svg = readFileSync(path.resolve(__dirname, "../apps/desktop/public/brand/app-icon.svg"), "utf8");
  await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
});
app.on("window-all-closed", () => app.quit());
