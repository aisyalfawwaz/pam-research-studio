import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Electron 45 fetches its official, checksum-verified binary lazily. Do this
// during online setup so first offline app launch does not need a download.
console.log(`Electron runtime ready: ${require("electron")}`);
