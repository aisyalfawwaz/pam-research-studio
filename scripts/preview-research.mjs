// Inspect actual frozen research records and exercise native presentation export.
import { _electron, expect } from "@playwright/test";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const evidence = JSON.parse(
  await readFile(".local/research-evidence.json", "utf8"),
);
const profile = await mkdtemp(path.join(tmpdir(), "pam-research-preview-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  args: [`--user-data-dir=${profile}`, "."],
  env,
  timeout: 60000,
});
await app.evaluate(({ dialog }) => {
  globalThis.__pamPreviewDialogs = {
    open: dialog.showOpenDialog,
    save: dialog.showSaveDialog,
  };
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
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, evidence.project);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run model", exact: true }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: /^Runs/ }).click();
  await page
    .getByRole("table", { name: "Run history", exact: true })
    .getByRole("row")
    .filter({ hasText: evidence.runs.coupled_population.slice(0, 8) })
    .getByRole("button")
    .click();
  await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
  await page
    .getByRole("button", { name: "Load saved settings", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Bubble dynamics", exact: true }).click();
  await page.getByLabel("Bubble source", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Maximum expansion", exact: true })
    .click();
  await page.screenshot({ path: "docs/images/research-population.png" });
  const videos = {};
  for (const mode of ["bubble", "pipeline"]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const modal = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    const file = path.resolve(`examples/research_refinements/${mode}.webm`);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await modal
      .getByLabel("Presentation video content", { exact: true })
      .selectOption(mode);
    await modal
      .getByLabel("Presentation video duration", { exact: true })
      .selectOption("6");
    await modal
      .getByRole("button", { name: "Export WebM video…", exact: true })
      .click();
    await expect(modal.getByRole("status")).toContainText("Exported", {
      timeout: 45000,
    });
    const previewDetails = modal.locator("details");
    if (!(await previewDetails.evaluate((details) => details.open)))
      await previewDetails.locator("summary").click();
    await expect(previewDetails).toHaveAttribute("open", "");
    const video = modal.getByLabel("Generated research video", { exact: true });
    await expect
      .poll(() => video.evaluate((v) => v.readyState), { timeout: 10000 })
      .toBeGreaterThan(1);
    const decoded = await video.evaluate(async (v) => {
      if (v.readyState < 2)
        await new Promise((resolve) =>
          v.addEventListener("loadeddata", resolve, { once: true }),
        );
      return { width: v.videoWidth, height: v.videoHeight };
    });
    expect(decoded).toEqual({ width: 960, height: 640 });
    await video.evaluate(
      (v) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Generated WebM seek timed out")),
            5000,
          );
          v.addEventListener(
            "seeked",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
          v.currentTime = 2.5;
        }),
    );
    await page.screenshot({ path: `docs/images/research-video-${mode}.png` });
    const bytes = await readFile(file),
      context = JSON.parse(await readFile(file + ".json", "utf8"));
    expect(context.video.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    videos[mode] = {
      file,
      sha256: context.video.sha256,
      bytes: bytes.length,
      decoded,
    };
    await modal.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Studies", exact: true }).click();
  for (const kind of ["sweep", "convergence", "uncertainty"]) {
    await page
      .getByLabel("Saved study", { exact: true })
      .selectOption(evidence.studies[kind]);
    await expect(
      page.getByRole("table", { name: "Study cases", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `docs/images/research-${kind}.png` });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await page.emulateMedia({ reducedMotion: null });
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = globalThis.__pamPreviewDialogs.open;
    dialog.showSaveDialog = globalThis.__pamPreviewDialogs.save;
    delete globalThis.__pamPreviewDialogs;
  });
  await writeFile(
    ".local/research-preview.json",
    JSON.stringify(
      {
        project: evidence.project,
        videos,
        renderer_errors: errors,
        electron_pid: app.process().pid,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Actual research app ready; two decoded WebM exports; studies inspected; no renderer errors. Electron PID",
    app.process().pid,
  );
  if (process.argv.includes("--keep-open"))
    await new Promise((resolve) => app.process().once("exit", resolve));
} finally {
  await app.close();
}
