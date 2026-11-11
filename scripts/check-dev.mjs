import { _electron, expect } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "pam-dev-check-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined),
);
delete env.ELECTRON_RUN_AS_NODE;
env.PAM_DEV_URL = "http://127.0.0.1:5173";
const app = await _electron.launch({
  args: [`--user-data-dir=${profile}`, "."],
  env,
});
try {
  let page;
  await expect
    .poll(
      () => {
        page = app.windows().find((p) => p.url() === "http://127.0.0.1:5173/");
        return !!page;
      },
      { timeout: 60000 },
    )
    .toBe(true);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page
    .getByRole("button", { name: "New", exact: true })
    .waitFor({ timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector(".main-toolbar button");
    return button !== null && !button.disabled;
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Development renderer connected to real sidecar without JavaScript/CSP errors.",
  );
} finally {
  await app.close();
}
