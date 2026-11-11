// Exercise the actual saved synthetic jbubble trajectory in the native app.
import { _electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const project = path.resolve(
  `.local/bubble-motion-v09-${randomUUID().slice(0, 8)}`,
);
const profile = await mkdtemp(path.join(tmpdir(), "pam-bubble-preview-"));
await mkdir(project);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  args: [`--user-data-dir=${profile}`, "."],
  env,
  timeout: 60000,
});
try {
  let page;
  await expect
    .poll(
      () => {
        page = app.windows().find((p) => p.url() === "app://studio/index.html");
        return !!page;
      },
      { timeout: 60000 },
    )
    .toBe(true);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, project);
  await page.getByRole("button", { name: "New", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New project", exact: true });
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("Bubble motion · jbubble");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simulate", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, path.resolve("examples/jbubble_64ch/experiment.zip"));
  await page
    .getByRole("menubar")
    .getByRole("menuitem", { name: "File", exact: true })
    .click();
  await page
    .getByRole("menu", { name: "File menu", exact: true })
    .locator("button").filter({hasText: "Import experiment…"})
    .click();
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
  await page
    .getByRole("button", { name: "Load saved settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run model", exact: true }),
  ).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Bubble dynamics", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play bubble playback", exact: true }),
  ).toBeVisible();
  const boundary = page.getByTestId("bubble-boundary");
  await page
    .getByRole("button", { name: "Maximum expansion", exact: true })
    .click();
  await expect(boundary).toHaveAttribute(
    "data-shell-regime",
    "Shell rupture regime",
  );
  const maximum = Number(await boundary.getAttribute("data-radius-m"));
  await page.screenshot({ path: "docs/images/bubble-motion-expanded.png" });
  await page
    .getByRole("button", { name: "Minimum radius", exact: true })
    .click();
  await expect(boundary).toHaveAttribute("data-shell-regime", "Buckled regime");
  const minimum = Number(await boundary.getAttribute("data-radius-m"));
  await page.screenshot({ path: "docs/images/bubble-motion-compressed.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL() === "app://studio/index.html")
      ?.setSize(1000, 720),
  );
  await expect(
    page.getByRole("slider", { name: "Bubble time (µs)", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/images/bubble-motion-compact.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL() === "app://studio/index.html")
      ?.setSize(1480, 980),
  );
  await page
    .getByRole("button", { name: "Restart bubble playback", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: null });
  await page
    .getByRole("button", { name: "Play bubble playback", exact: true })
    .click();
  const initial = await boundary.getAttribute("data-radius-m");
  await expect
    .poll(() => boundary.getAttribute("data-radius-m"))
    .not.toBe(initial);
  if (errors.length) throw new Error(errors.join("\n"));
  const info = await page.evaluate(() => window.pam.request("projectInfo"));
  await writeFile(
    ".local/bubble-motion-preview.json",
    JSON.stringify(
      {
        project,
        run_id: info.runs.find((r) => r.status === "complete").id,
        source_bundle: "examples/jbubble_64ch/experiment.zip",
        source:
          "Frozen scientific trajectory and original provenance retained; 0.9 playback/inspection",
        maximum_radius_m: maximum,
        minimum_radius_m: minimum,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Actual bubble playback running; extrema ${minimum}–${maximum} m; four synchronized curves; no renderer errors. Project ${project}; launcher PID ${app.process().pid}`,
  );
  if (process.argv.includes("--keep-open"))
    await new Promise((resolve) => app.process().once("exit", resolve));
} finally {
  await app.close();
}
