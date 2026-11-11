import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
await import("./build-electron.mjs");
const vite = await createServer();
await vite.listen();
const require = createRequire(import.meta.url);
const electronEnvironment = { ...process.env, PAM_DEV_URL: "http://127.0.0.1:5173" };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), ["."], {
  stdio: "inherit",
  windowsHide: false,
  env: electronEnvironment,
});
child.on("exit", async (code) => {
  await vite.close();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill());
