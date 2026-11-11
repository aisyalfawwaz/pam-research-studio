import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import type { Run, RunSummary } from "../../../packages/contracts";

async function launch() {
  const folder = await mkdtemp(path.join(tmpdir(), "pam-dsp-ct-")),
    project = path.join(folder, "project");
  await mkdir(project);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [`--user-data-dir=${path.join(folder, "profile")}`, "."],
    env,
    timeout: 60000,
  });
  let page: Page | undefined;
  await expect
    .poll(
      () => {
        page = app.windows().find((p) => p.url() === "app://studio/index.html");
        return !!page;
      },
      { timeout: 60000 },
    )
    .toBe(true);
  await expect(
    page!.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL() === "app://studio/index.html")
      ?.setPosition(-3000, 0);
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, project);
  await page!.getByRole("button", { name: "New", exact: true }).click();
  await page!
    .getByRole("dialog", { name: "New project", exact: true })
    .getByRole("button", { name: "Create", exact: true })
    .click();
  return { app, page: page!, folder };
}
async function complete(page: Page) {
  await expect
    .poll(
      async () => {
        const job = (await page.evaluate(() => window.pam.request("job"))) as {
          status: string;
          error?: string;
        };
        if (job.status === "failed") throw new Error(job.error);
        return job.status;
      },
      { timeout: 150000 },
    )
    .toBe("complete");
}
async function savePath(app: ElectronApplication, file: string) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
}

test("SciPy receive conditioning: actual filtered RF, response, and conditioned CSV", async ({}, info) => {
  const { app, page, folder } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page.getByRole("button", { name: "DAS only", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("17");
    await page
      .getByRole("checkbox", {
        name: "Enable receive conditioning",
        exact: true,
      })
      .check();
    await page
      .getByRole("spinbutton", { name: "Lower cutoff (MHz)", exact: true })
      .fill("0.5");
    await page
      .getByRole("spinbutton", { name: "Upper cutoff (MHz)", exact: true })
      .fill("1.5");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await complete(page);
    await page.getByRole("tab", { name: "RF data", exact: true }).click();
    await page
      .getByLabel("RF signal", { exact: true })
      .selectOption("processed");
    await expect(
      page.getByRole("img", { name: /Channel waveform;/ }),
    ).toBeVisible();
    await page
      .getByLabel("Spectrum content", { exact: true })
      .selectOption("filter");
    await expect(
      page.getByRole("img", {
        name: /Receive filter · forward\/backward response;/,
      }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("dsp-response.png") });
    const csv = path.join(folder, "conditioned.csv");
    await savePath(app, csv);
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(csv, "utf8")).split("\n")[0].trim();
        } catch {
          return "";
        }
      })
      .toBe("time_s,conditioned_amplitude_au");
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const run = runs.find((r) => r.status === "complete")!;
    const trace = await page.evaluate(
      async (id) =>
        Array.from(
          new Float32Array(
            (await window.pam.array(id, "trace_processed", 31)).buffer,
          ),
        ),
      run.id,
    );
    const lines = (await readFile(csv, "utf8")).trim().split("\n");
    expect(Number(lines[21].split(",")[1])).toBeCloseTo(trace[41], 12);
    expect(errors).toEqual([]);
  } finally {
    await page
      .screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});

test("synthetic CT only: actual heterogeneous coupled solver, DSP and matched water/PAM comparison", async ({}, info) => {
  test.setTimeout(240000);
  test.skip(
    !existsSync(".adapters/jwave/.venv/Scripts/python.exe") ||
      !existsSync(".adapters/jbubble/.venv/Scripts/python.exe"),
    "Install both runtimes",
  );
  const { app, page, folder } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.getByRole("tab", { name: "CT medium", exact: true }).click();
    await page
      .getByRole("button", { name: "Synthetic skull phantom", exact: true })
      .click();
    await expect(
      page.getByRole("img", {
        name: "CT anatomy with simulation crop, sources and receivers",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("ct-synthetic-medium.png") });
    await page
      .getByRole("button", { name: "Run water reference", exact: true })
      .click();
    await complete(page);
    await page.getByRole("tab", { name: "CT medium", exact: true }).click();
    await expect(
      page.getByRole("img", { name: /Water reference · DAS;/ }),
    ).toBeAttached();
    await page
      .getByRole("button", { name: "Run CT medium", exact: true })
      .click();
    await expect(
      page.getByRole("img", {
        name: "Acoustic pressure · actual j-Wave field",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    await page.screenshot({ path: info.outputPath("ct-live.png") });
    await complete(page);
    await page.getByRole("tab", { name: "CT medium", exact: true }).click();
    const comparison = page.getByRole("img", { name: /CT medium · DAS;/ });
    await expect(comparison).toBeAttached();
    // Replay always represents raw acquisition, independently of RF Explorer DSP mode.
    const replayImage = async (mode: "raw" | "processed") => {
      await page.getByRole("tab", { name: "RF data", exact: true }).click();
      await page.getByLabel("RF signal", { exact: true }).selectOption(mode);
      await expect(
        page.getByRole("img", { name: /RF overview;/ }),
      ).toBeVisible();
      await page
        .getByRole("tab", { name: "Live simulation", exact: true })
        .click();
      const slider = page.getByRole("slider", {
        name: "Wave frame",
        exact: true,
      });
      await expect(slider).toBeEnabled();
      await slider.fill(
        String(Math.min(180, Number(await slider.getAttribute("max")))),
      );
      const image = page
        .getByRole("img", { name: /Sensor signals · acquired RF;/ })
        .locator("image")
        .first();
      await expect(image).toHaveAttribute("href", /^data:image/);
      return image.getAttribute("href");
    };
    const rawReplay = await replayImage("raw"),
      conditionedReplay = await replayImage("processed");
    expect(conditionedReplay).toBe(rawReplay);
    await page.getByRole("tab", { name: "CT medium", exact: true }).click();
    await page.locator(".ct-comparison").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("ct-pam-comparison.png") });
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const records = (await Promise.all(
      runs
        .filter((r) => r.status === "complete")
        .map((r) => page.evaluate((id) => window.pam.request("run", id), r.id)),
    )) as Run[];
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.config.ct && r.config.processing)).toBe(true);
    expect(records.map((r) => r.config.ct!.contrast).sort()).toEqual([
      false,
      true,
    ]);
    const csv = path.join(folder, "ct-experiment.zip");
    await savePath(app, csv);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    await dialog.getByLabel("Include raw RF data").check();
    await dialog.getByRole("button", { name: "Export ZIP…" }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(csv)).byteLength;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(1000);
    // Reconstruct the identical recorded CT RF using the saved slowness field.
    await page
      .getByRole("button", { name: "Toggle Properties panel", exact: true })
      .click();
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page
      .getByLabel("Receive delay model", { exact: true })
      .selectOption("ct_slowness");
    const beforeCorrection = (await page.evaluate(() =>
      window.pam.request("job"),
    )) as { run_id: string };
    await page.keyboard.press("F6");
    await expect
      .poll(
        async () =>
          (
            (await page.evaluate(() => window.pam.request("job"))) as {
              run_id: string;
            }
          ).run_id,
      )
      .not.toBe(beforeCorrection.run_id);
    await complete(page);
    const correctedJob = (await page.evaluate(() =>
      window.pam.request("job"),
    )) as { run_id: string };
    const corrected = (await page.evaluate(
      (id) => window.pam.request("run", id),
      correctedJob.run_id,
    )) as Run;
    expect(
      (corrected.provenance.reconstruction_options as { receive_model: string })
        .receive_model,
    ).toBe("ct_slowness");
    expect(
      await page.evaluate(
        async ([before, after]) => {
          const a = new Uint8Array(
            (await window.pam.array(before, "rf")).buffer,
          );
          const b = new Uint8Array(
            (await window.pam.array(after, "rf")).buffer,
          );
          return (
            a.length > 0 &&
            a.length === b.length &&
            a.every((value, i) => value === b[i])
          );
        },
        [beforeCorrection.run_id, correctedJob.run_id],
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const presentation = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    const pipelineVideo = path.join(folder, "ct-pipeline.webm");
    await savePath(app, pipelineVideo);
    await presentation
      .getByLabel("Presentation video content", { exact: true })
      .selectOption("pipeline");
    await presentation
      .getByLabel("Presentation video duration", { exact: true })
      .selectOption("2");
    await presentation
      .getByRole("button", { name: "Export WebM video…", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          try {
            return (await readFile(pipelineVideo)).length;
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(1000);
    const videoContext = JSON.parse(
      await readFile(pipelineVideo + ".json", "utf8"),
    );
    expect(videoContext.video.mode).toBe("pipeline");
    expect(
      videoContext.run.provenance.reconstruction_options.receive_model,
    ).toBe("ct_slowness");
    await presentation
      .getByRole("button", { name: "Close", exact: true })
      .click();
    // A source/backend switch detaches incompatible anatomy and rewires the graph.
    const previousJob = (await page.evaluate(() =>
      window.pam.request("job"),
    )) as { run_id: string };
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await page.getByLabel("Solver", { exact: true }).selectOption("analytic");
    await expect
      .poll(async () => {
        const info = (await page.evaluate(() =>
          window.pam.request("projectInfo"),
        )) as {
          draft: { ct?: unknown; simulation?: unknown; bubble?: unknown };
        };
        return !!(info.draft.ct || info.draft.simulation || info.draft.bubble);
      })
      .toBe(false);
    await page.getByRole("tab", { name: "Model builder", exact: true }).click();
    await page.getByRole("button", { name: "Run model", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            (await page.evaluate(() => window.pam.request("job"))) as {
              run_id: string;
            }
          ).run_id,
      )
      .not.toBe(previousJob.run_id);
    await complete(page);
    expect(errors).toEqual([]);
  } finally {
    await page
      .screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});
