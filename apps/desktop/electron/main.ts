import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  net,
  session,
  nativeImage,
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { z } from "zod";
import {
  studyRequestSchema,
  studyLaunchSchema,
  studyResumeSchema,
} from "../../../packages/contracts/studies";
import {
  workflowSchema,
  workflowRequestSchema,
} from "../../../packages/contracts/workflow";
import {
  actions,
  arrayKinds,
  configSchema,
  benchmarkRequestSchema,
  benchmarkSettingsSchema,
  benchmarkEvaluationSchema,
  projectSessionSchema,
  reconstructSchema,
  uuid,
} from "../../../packages/contracts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let sidecar: ChildProcessWithoutNullStreams | null = null;
let port = 0;
const token = randomBytes(32).toString("hex");
const devURL = process.env.PAM_DEV_URL;
if (devURL && devURL !== "http://127.0.0.1:5173")
  throw new Error("Invalid development origin");
const rendererURL = devURL || "app://studio/index.html";

function checkSender(event: Electron.IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    (event.senderFrame.url !== rendererURL &&
      event.senderFrame.url !== rendererURL + "/")
  ) {
    throw new Error("Untrusted IPC sender");
  }
}

async function api(
  route: string,
  method = "GET",
  body?: unknown,
  binary = false,
  maxBytes = 2_000_000,
) {
  if (process.env.PAM_DEBUG) console.error(`[engine] ${method} ${route}`);
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (process.env.PAM_DEBUG)
    console.error(`[engine] ${response.status} ${route}`);
  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ detail: `Engine returned ${response.status}` }))) as {
      detail: unknown;
    };
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail),
    );
  }
  if (binary) {
    const buffer = await response.arrayBuffer();
    const shape = z
      .array(z.number().int().positive())
      .max(2)
      .parse(JSON.parse(response.headers.get("X-Array-Shape") || "[]"));
    if (
      buffer.byteLength !== shape.reduce((a, b) => a * b, 1) * 4 ||
      buffer.byteLength > maxBytes
    )
      throw new Error("Invalid preview size");
    return { shape, buffer };
  }
  return response.json();
}

function registerIPC() {
  ipcMain.handle("pam:report-export", async (event, id, scope, settings) => {
    checkSender(event);
    const key = uuid.parse(id),
      type = z.enum(["run", "study"]).parse(scope);
    const evaluation =
      settings === undefined
        ? undefined
        : benchmarkSettingsSchema.parse(settings);
    if (type === "study" && evaluation)
      throw new Error("Study reports use their frozen evaluation settings");
    const selected = await dialog.showSaveDialog(window!, {
      title: "Export research PDF report",
      defaultPath: `pam-${type}-${key.slice(0, 8)}.pdf`,
      filters: [{ name: "PDF research report", extensions: ["pdf"] }],
    });
    if (selected.canceled || !selected.filePath) return null;
    return api(
      `/${type === "run" ? "runs" : "studies"}/${key}/report`,
      "POST",
      {
        path: selected.filePath,
        ...(evaluation ? { settings: evaluation } : {}),
      },
    );
  });
  ipcMain.handle("pam:video-save", async (event, id, data, metadata) => {
    checkSender(event);
    const key = uuid.parse(id);
    const meta = z
      .object({
        mode: z.enum(["bubble", "pipeline"]),
        source_index: z.number().int().min(0).max(7),
        fps: z.number().int().min(10).max(30),
        duration_s: z.number().min(2).max(20),
        width: z.literal(960),
        height: z.literal(640),
        mime: z.enum([
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
        ]),
        method: z.enum(["das", "tea", "cf", "rcb", "atp"]),
        physical_time_range_s: z.tuple([
          z.number().finite(),
          z.number().finite(),
        ]),
      })
      .strict()
      .parse(metadata);
    if (!(data instanceof Uint8Array))
      throw new Error("Expected a typed video buffer");
    if (data.byteLength < 64 || data.byteLength > 32 * 1024 ** 2)
      throw new Error(`Invalid encoded video size: ${data.byteLength} bytes`);
    const bytes = Buffer.from(data);
    if (bytes.readUInt32BE(0) !== 0x1a45dfa3)
      throw new Error("Expected a WebM container");
    const context = await api(`/runs/${key}/presentation-context`);
    if (
      meta.source_index >= context.run.config.sources.length ||
      meta.physical_time_range_s[1] <= meta.physical_time_range_s[0]
    )
      throw new Error("Invalid video source/clock");
    const selected = await dialog.showSaveDialog(window!, {
      title: "Export simulated video",
      defaultPath: `pam-${meta.mode}-${key.slice(0, 8)}.webm`,
      filters: [{ name: "WebM video", extensions: ["webm"] }],
    });
    if (selected.canceled || !selected.filePath) return null;
    if (path.extname(selected.filePath).toLowerCase() !== ".webm")
      throw new Error("Video filename must end in .webm");
    const target = selected.filePath,
      temp = target + "." + randomBytes(8).toString("hex") + ".tmp",
      jsonTarget = target + ".json",
      jsonTemp = temp + ".json";
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await writeFile(temp, bytes);
      await writeFile(
        jsonTemp,
        JSON.stringify(
          {
            ...context,
            video: {
              ...meta,
              sha256,
              requested_fps: meta.fps,
              encoded_frame_count: Math.round(meta.duration_s * meta.fps),
              encoder: "Chromium WebCodecs VP8",
              muxer: "Mediabunny 1.65.2",
              notes:
                "Timestamped VP8 frames encoded with Chromium WebCodecs and Mediabunny 1.65.2, MPL-2.0. Recorded numerical data resampled for slow-motion presentation. Pipeline final PAM appears only after acquisition; ending is held for inspection. No synthetic pressure frames or fragment animation.",
            },
          },
          null,
          2,
        ) + "\n",
      );
      await rename(temp, target);
      await rename(jsonTemp, jsonTarget);
    } finally {
      await unlink(temp).catch(() => {});
      await unlink(jsonTemp).catch(() => {});
    }
    return { path: target, sha256 };
  });
  ipcMain.handle("pam:study-export", async (event, id, format) => {
    checkSender(event);
    const runId = uuid.parse(id),
      type = z.enum(["csv", "json"]).parse(format);
    const selected = await dialog.showSaveDialog(window!, {
      title: "Export research study",
      defaultPath: `study-${runId.slice(0, 8)}.${type}`,
      filters: [{ name: type.toUpperCase(), extensions: [type] }],
    });
    if (selected.canceled || !selected.filePath) return null;
    return api(`/studies/${runId}/export`, "POST", {
      path: selected.filePath,
      format: type,
    });
  });
  ipcMain.handle("pam:ct-import", async (event) => {
    checkSender(event);
    const selected = await dialog.showOpenDialog(window!, {
      title: "Import single CT DICOM slice",
      properties: ["openFile"],
      filters: [{ name: "DICOM CT", extensions: ["dcm", "dicom"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return api("/ct/import", "POST", { path: selected.filePaths[0] });
  });
  ipcMain.handle("pam:ct-array", (event, config) => {
    checkSender(event);
    const cfg = configSchema.parse(config);
    if (!cfg.ct) throw new Error("No CT asset selected");
    return api("/ct/preview", "POST", cfg, true, 1_048_576);
  });
  ipcMain.handle("pam:request", async (event, action, payload) => {
    checkSender(event);
    const operation = z.enum(actions).parse(action);
    if (JSON.stringify(payload ?? null).length > 65536)
      throw new Error("Request too large");
    switch (operation) {
      case "planStudy":
        return api("/studies/plan", "POST", studyRequestSchema.parse(payload));
      case "startStudy":
        return api("/studies", "POST", studyLaunchSchema.parse(payload));
      case "studies":
        return api("/studies");
      case "study":
        return api(`/studies/${uuid.parse(payload)}`);
      case "resumeStudy": {
        const value = studyResumeSchema.parse(payload);
        return api(`/studies/${value.id}/resume`, "POST", {
          session_id: value.session_id,
        });
      }
      case "health":
        return api("/health");
      case "demo":
        return api("/demo");
      case "methods":
        return api("/methods");
      case "backends":
        return api("/backends");
      case "live":
        return api("/live");
      case "publicCT":
        return api("/ct/public", "POST");
      case "phantomCT":
        return api("/ct/phantom", "POST");
      case "wholeCT":
        return api("/ct/whole", "POST", configSchema.parse(payload));
      case "ctInfo":
        return api("/ct/info", "POST", configSchema.parse(payload));
      case "workflow":
        return api("/workflow");
      case "saveWorkflow":
        return api(
          "/workflow",
          "PUT",
          z
            .union([
              workflowSchema,
              z
                .object({
                  workflow: workflowSchema,
                  session_id: projectSessionSchema,
                })
                .strict(),
            ])
            .parse(payload),
        );
      case "validateWorkflow":
        return api(
          "/workflow/validate",
          "POST",
          workflowRequestSchema.parse(payload),
        );
      case "runWorkflow":
        return api(
          "/workflow/run",
          "POST",
          workflowRequestSchema.parse(payload),
        );
      case "projectInfo":
        return api("/project");
      case "saveDraft": {
        const parsed = z
          .union([
            configSchema,
            z
              .object({
                config: configSchema,
                session_id: projectSessionSchema,
              })
              .strict(),
          ])
          .parse(payload);
        return api(
          "/draft",
          "PUT",
          "config" in parsed ? parsed : { config: parsed },
        );
      }
      case "simulate":
        return api("/simulate", "POST", {
          config: configSchema.parse(payload),
        });
      case "reconstruct":
        return api(
          "/reconstruct",
          "POST",
          typeof payload === "string"
            ? { input_run_id: uuid.parse(payload) }
            : reconstructSchema.parse(payload),
        );
      case "job":
        return api("/job");
      case "cancel":
        return api("/cancel", "POST");
      case "runs":
        return api("/runs");
      case "run":
        return api(`/runs/${uuid.parse(payload)}`);
      case "benchmark": {
        const value = benchmarkRequestSchema.parse(payload);
        return api(`/runs/${value.run_id}/benchmark`, "POST", value.settings);
      }
      case "evaluateBenchmark":
        return api(
          "/benchmarks/evaluate",
          "POST",
          benchmarkEvaluationSchema.parse(payload),
        );
    }
  });
  ipcMain.handle("pam:array", (event, id, kind, channel) => {
    checkSender(event);
    return api(
      `/runs/${uuid.parse(id)}/arrays/${z.enum(arrayKinds).parse(kind)}?channel=${z.number().int().min(0).max(1023).parse(channel)}`,
      "GET",
      undefined,
      true,
      kind === "wave"
        ? 6_000_000
        : kind === "rf" || kind === "rf_processed"
          ? 2_097_152
          : 2_000_000,
    );
  });
  ipcMain.handle(
    "pam:benchmark-export",
    async (event, ids, settings, format) => {
      checkSender(event);
      const runIds = z.array(uuid).min(1).max(2).parse(ids);
      const options = benchmarkSettingsSchema.parse(settings);
      const extension = z.enum(["csv", "json"]).parse(format);
      const selected = await dialog.showSaveDialog(window!, {
        defaultPath: `pam-benchmark-${runIds[0].slice(0, 8)}.${extension}`,
        filters: [{ name: "PAM benchmark", extensions: [extension] }],
      });
      if (selected.canceled || !selected.filePath) return null;
      return api("/benchmark-export", "POST", {
        run_ids: runIds,
        settings: options,
        format: extension,
        path: selected.filePath,
      });
    },
  );
  ipcMain.handle("pam:project", async (event, create, name) => {
    checkSender(event);
    z.boolean().parse(create);
    const selected = await dialog.showOpenDialog(window!, {
      title: create
        ? "Choose an empty folder for your project"
        : "Open PAM project folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return api("/project", "POST", {
      path: selected.filePaths[0],
      name: z
        .string()
        .min(1)
        .max(120)
        .parse(name || "Point-source study"),
      create,
    });
  });
  ipcMain.handle("pam:export", async (event, id, raw) => {
    checkSender(event);
    const runId = uuid.parse(id);
    z.boolean().parse(raw);
    const selected = await dialog.showSaveDialog(window!, {
      title: "Export reproducible experiment",
      defaultPath: `pam-${runId.slice(0, 8)}.zip`,
      filters: [{ name: "Experiment bundle", extensions: ["zip"] }],
    });
    if (selected.canceled || !selected.filePath) return null;
    return api(`/runs/${runId}/export`, "POST", {
      path: selected.filePath,
      include_raw: raw,
    });
  });
  ipcMain.handle("pam:import", async (event) => {
    checkSender(event);
    const selected = await dialog.showOpenDialog(window!, {
      title: "Import synthetic experiment bundle",
      filters: [{ name: "Experiment bundle", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return api("/import", "POST", { path: selected.filePaths[0] });
  });
  ipcMain.handle(
    "pam:exportRF",
    async (event, id, kind, channel, signal = "raw") => {
      checkSender(event);
      const runId = uuid.parse(id);
      const extension = z.enum(["csv", "h5"]).parse(kind);
      const ch = z.number().int().min(0).max(1023).parse(channel);
      const mode = z.enum(["raw", "processed"]).parse(signal);
      const selected = await dialog.showSaveDialog(window!, {
        defaultPath: `rf-${runId.slice(0, 8)}.${extension}`,
        filters: [{ name: "RF data", extensions: [extension] }],
      });
      if (selected.canceled || !selected.filePath) return null;
      return api(
        `/runs/${runId}/rf-export?channel=${ch}&signal=${mode}`,
        "POST",
        {
          path: selected.filePath,
          include_raw: true,
        },
      );
    },
  );
}

async function startSidecar() {
  const root = app.getAppPath();
  const python = app.isPackaged
    ? path.join(process.resourcesPath, "sidecar", "pam-sidecar.exe")
    : path.join(
        root,
        ".venv",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
  if (!existsSync(python))
    throw new Error(
      "Python sidecar missing. Development: run uv sync --python 3.13 in the project folder.",
    );
  sidecar = spawn(python, app.isPackaged ? [] : ["-m", "pamstudio.server"], {
    cwd: root,
    windowsHide: true,
    shell: false,
    env: {
      ...process.env,
      PAM_SIDECAR_TOKEN: token,
      PYTHONUNBUFFERED: "1",
      PAM_NODE_VERSION: process.versions.node,
    },
  });
  let errors = "";
  sidecar.stderr.on("data", (data: Buffer) => {
    errors = (errors + data.toString()).slice(-4000);
    if (process.env.PAM_DEBUG) process.stderr.write(data);
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Sidecar startup timed out. ${errors}`)),
      45000,
    );
    let output = "";
    sidecar!.once("error", reject);
    sidecar!.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Sidecar exited (${code}). ${errors}`));
    });
    sidecar!.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.includes("\n")) {
        try {
          port = z
            .object({
              port: z.number().int().min(1).max(65535),
              protocol: z.literal(1),
            })
            .parse(JSON.parse(output.split("\n")[0])).port;
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      }
    });
  });
  for (let tries = 0; tries < 100; tries++) {
    try {
      await api("/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Sidecar health check failed. ${errors}`);
}

app.whenReady().then(async () => {
  try {
    const root = path.resolve(app.getAppPath(), "dist");
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (url.hostname !== "studio" || !file.startsWith(root + path.sep))
        return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    if (process.platform === "win32")
      app.setAppUserModelId("org.pamstudio.research");
    const icon = nativeImage.createFromPath(
      path.join(
        app.getAppPath(),
        app.isPackaged || !devURL ? "dist" : "apps/desktop/public",
        "brand/app-icon.png",
      ),
    );
    window = new BrowserWindow({
      show: false,
      icon,
      width: 1480,
      height: 980,
      minWidth: 1000,
      minHeight: 700,
      title: "PAM Research Studio",
      backgroundColor: "#e9edf1",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    splash = new BrowserWindow({
      width: 790,
      height: 590,
      useContentSize: true,
      frame: false,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      title: "PAM Research Studio — Starting",
      backgroundColor: "#f9fafb",
      icon,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    splash.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    splash.webContents.on("will-navigate", (event) => event.preventDefault());
    splash.once("ready-to-show", () => splash?.show());
    await splash.loadURL(
      devURL ? `${devURL}/splash.html` : "app://studio/splash.html",
    );
    await startSidecar();
    registerIPC();
    await window.loadURL(rendererURL);
    window.show();
    if (splash && !splash.isDestroyed()) splash.close();
    splash = null;
    sidecar!.once("exit", () => {
      if (window && !window.isDestroyed())
        void dialog.showMessageBox(window, {
          type: "error",
          message:
            "Scientific engine stopped. Restart the app to recover interrupted runs.",
        });
    });
  } catch (error) {
    dialog.showErrorBox("PAM Research Studio startup", String(error));
    app.quit();
  }
});
app.on("window-all-closed", () => app.quit());
let stopping = false;
app.on("before-quit", (event) => {
  if (!sidecar || stopping) return;
  event.preventDefault();
  stopping = true;
  window = null;
  const timeout = setTimeout(() => {
    sidecar?.kill();
    app.quit();
  }, 5000);
  sidecar.once("exit", () => {
    clearTimeout(timeout);
    app.quit();
  });
  sidecar.stdin.end();
});
