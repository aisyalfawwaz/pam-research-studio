import { existsSync } from "node:fs";
if (!existsSync("sidecar/pam-sidecar.exe")) {
  throw new Error(
    "A packaged Python runtime is required at sidecar/pam-sidecar.exe. See docs/packaging.md. Developer startup uses .venv; an Electron shell alone is not a scientific app.",
  );
}
