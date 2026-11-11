import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type {
  StudyListItem,
  StudyRecord,
} from "../../../packages/contracts/studies";

test("research studies: real Cartesian sweep, RF-reusing convergence, calibration trials and PDF/CSV/JSON", async ({}, info) => {
  test.setTimeout(180000);
  const folder = await mkdtemp(path.join(tmpdir(), "pam-research-")),
    project = path.join(folder, "project");
  await mkdir(project);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [`--user-data-dir=${path.join(folder, "profile")}`, "."],
    env,
    timeout: 60000,
  });
  let page: Page | undefined;
  try {
    await expect
      .poll(
        () => {
          page = app
            .windows()
            .find((p) => p.url() === "app://studio/index.html");
          return !!page;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")
        ?.setPosition(-3000, 0),
    );
    await expect(
      page!.getByRole("button", { name: "New", exact: true }),
    ).toBeEnabled();
    const errors: string[] = [];
    page!.on("pageerror", (e) => errors.push(e.message));
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
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page!.getByRole("button", { name: "DAS only", exact: true }).click();
    await page!
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("33");
    await page!.getByRole("tab", { name: "Studies", exact: true }).click();
    const start = async () => {
      const existing = (
        (await page!.evaluate(() =>
          window.pam.request("studies"),
        )) as StudyListItem[]
      ).map((s) => s.id);
      await page!
        .getByRole("button", { name: "Check study", exact: true })
        .click();
      await expect(
        page!.getByRole("button", { name: "Start study", exact: true }),
      ).toBeEnabled();
      await page!
        .getByRole("button", { name: "Start study", exact: true })
        .click();
      let record: StudyRecord | undefined;
      await expect
        .poll(
          async () => {
            const studies = (await page!.evaluate(() =>
              window.pam.request("studies"),
            )) as StudyListItem[];
            const id = studies.find((s) => !existing.includes(s.id))?.id;
            if (!id) return "waiting";
            record = (await page!.evaluate(
              (id) => window.pam.request("study", id),
              id,
            )) as StudyRecord;
            if (record.status === "failed") throw new Error(record.error);
            return record.status;
          },
          { timeout: 90000 },
        )
        .toBe("complete");
      await expect(
        page!.getByRole("button", { name: "Check study", exact: true }),
      ).toBeEnabled();
      await expect(
        page!
          .getByRole("table", { name: "Study cases", exact: true })
          .getByRole("row"),
      ).toHaveCount(record!.total + 1);
      return record!;
    };
    await page!.getByLabel("Study values", { exact: true }).fill("10, 30");
    await page!
      .getByRole("checkbox", { name: "Second axis", exact: true })
      .check();
    await page!
      .getByLabel("Second study values", { exact: true })
      .fill("-1, 1");
    const sweep = await start();
    expect(sweep.total).toBe(4);
    expect(new Set(sweep.cases.map((c) => c.run_id)).size).toBe(4);
    await page!.screenshot({ path: info.outputPath("research-sweep.png") });
    await page!
      .getByLabel("Study type", { exact: true })
      .selectOption("convergence");
    await page!.getByLabel("Study values", { exact: true }).fill("17, 33, 65");
    const conv = await start();
    expect(conv.summary?.cases).toHaveLength(3);
    expect(conv.summary?.cases?.every((c) => c.rf_relative_l2 === 0)).toBe(
      true,
    );
    await expect(
      page!.getByRole("table", { name: "Convergence errors", exact: true }),
    ).toBeVisible();
    await page!.screenshot({
      path: info.outputPath("research-convergence.png"),
    });
    await page!
      .getByLabel("Study type", { exact: true })
      .selectOption("uncertainty");
    await page!
      .getByRole("spinbutton", { name: "Independent trials", exact: true })
      .fill("8");
    const uncertainty = await start();
    expect(uncertainty.total).toBe(8);
    expect(
      uncertainty.summary?.methods?.das?.localization_error_m.mean_ci95,
    ).toHaveLength(2);
    expect(
      uncertainty.cases.some((c) => c.parameters.actual_speed_m_s !== 1500),
    ).toBe(true);
    await expect(
      page!.getByRole("table", { name: "Uncertainty statistics", exact: true }),
    ).toBeVisible();
    await page!
      .getByLabel("Study result metric", { exact: true })
      .selectOption("gcnr");
    await expect(
      page!.getByRole("img", { name: /Observed trial distribution/ }),
    ).toBeVisible();
    await page!.screenshot({
      path: info.outputPath("research-uncertainty.png"),
    });
    const file = async (target: string) =>
      app.evaluate(({ dialog }, target) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: target,
        });
      }, target);
    const csv = path.join(folder, "trials.csv");
    await file(csv);
    await page!
      .getByRole("button", { name: "Export cases CSV…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(csv, "utf8")).split("\n").filter(Boolean)
            .length;
        } catch {
          return 0;
        }
      })
      .toBe(9);
    const json = path.join(folder, "trials.json");
    await file(json);
    await page!
      .getByRole("button", { name: "Export full study JSON…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(json, "utf8")).summary.methods.das
            .gcnr.valid;
        } catch {
          return 0;
        }
      })
      .toBe(8);
    const pdf = path.join(folder, "trials.pdf");
    await file(pdf);
    await page!
      .getByRole("button", { name: "Export study PDF…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(pdf)).subarray(0, 5).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF-");
    const context = JSON.parse(
      await readFile(path.join(folder, "trials.report.json"), "utf8"),
    );
    expect(context.study.id).toBe(uncertainty.id);
    const row = page!
      .getByRole("table", { name: "Study cases", exact: true })
      .getByRole("row")
      .nth(1);
    await row
      .getByRole("button", { name: "PAM / benchmark", exact: true })
      .click();
    await expect(
      page!.getByRole("table", { name: "PAM benchmark results", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page
      ?.screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});

test("bubble population: independent physical controls, source inspection, PDF and decodable WebM", async ({}, info) => {
  test.setTimeout(180000);
  test.skip(
    !existsSync(".adapters/jbubble/.venv/Scripts/python.exe"),
    "Install optional jbubble runtime",
  );
  const folder = await mkdtemp(path.join(tmpdir(), "pam-population-")),
    project = path.join(folder, "project");
  await mkdir(project);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [`--user-data-dir=${path.join(folder, "profile")}`, "."],
    env,
    timeout: 60000,
  });
  let page: Page | undefined;
  try {
    await expect
      .poll(
        () => {
          page = app
            .windows()
            .find((p) => p.url() === "app://studio/index.html");
          return !!page;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")
        ?.setPosition(-3000, 0),
    );
    await expect(
      page!.getByRole("button", { name: "New", exact: true }),
    ).toBeEnabled();
    const errors: string[] = [];
    page!.on("pageerror", (e) => errors.push(e.message));
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
    const solver = page!.getByLabel("Solver", { exact: true });
    await expect
      .poll(() => solver.locator('option[value="jbubble"]').isEnabled(), {
        timeout: 60000,
      })
      .toBe(true);
    await solver.selectOption("jbubble");
    await page!
      .getByRole("spinbutton", { name: "Drive pressure (kPa)", exact: true })
      .fill("20");
    await page!
      .getByRole("spinbutton", { name: "Ringdown (cycles)", exact: true })
      .fill("2");
    await page!
      .getByRole("button", { name: "Add source", exact: true })
      .click();
    await expect(
      page!.getByLabel("Selected source", { exact: true }),
    ).toHaveValue("1");
    await page!
      .getByRole("checkbox", {
        name: "Independent bubble parameters",
        exact: true,
      })
      .check();
    await page!
      .getByLabel("Source shell model", { exact: true })
      .selectOption("free");
    await page!
      .getByRole("spinbutton", { name: "Source radius (µm)", exact: true })
      .fill("1.5");
    await page!
      .getByRole("spinbutton", { name: "Source drive (kPa)", exact: true })
      .fill("30");
    await page!
      .getByRole("spinbutton", {
        name: "Source ringdown (cycles)",
        exact: true,
      })
      .fill("3");
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page!.getByRole("button", { name: "DAS only", exact: true }).click();
    await page!
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("33");
    await page!.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page!.getByRole("img", { name: /RF overview;/ })).toBeVisible({
      timeout: 90000,
    });
    await page!
      .getByRole("tab", { name: "Bubble dynamics", exact: true })
      .click();
    await page!.getByLabel("Bubble source", { exact: true }).selectOption("1");
    await page!
      .getByRole("button", { name: "Restart bubble playback", exact: true })
      .click();
    expect(
      Number(
        await page!
          .getByTestId("bubble-boundary")
          .getAttribute("data-radius-m"),
      ),
    ).toBeCloseTo(1.5e-6, 12);
    await expect(page!.getByTestId("bubble-boundary")).toHaveAttribute(
      "data-shell-regime",
      "Uncoated",
    );
    await page!.screenshot({
      path: info.outputPath("population-source-two.png"),
    });
    await page!.getByLabel("Bubble source", { exact: true }).selectOption("0");
    await page!
      .getByRole("button", { name: "Restart bubble playback", exact: true })
      .click();
    expect(
      Number(
        await page!
          .getByTestId("bubble-boundary")
          .getAttribute("data-radius-m"),
      ),
    ).toBeCloseTo(2e-6, 12);
    await page!.keyboard.press("F6");
    await expect(
      page!.getByRole("table", {
        name: "Reconstruction measurements",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    await page!
      .getByRole("tab", { name: "Bubble dynamics", exact: true })
      .click();
    await page!.getByLabel("Bubble source", { exact: true }).selectOption("1");
    await page!
      .getByRole("button", { name: "Maximum expansion", exact: true })
      .click();
    const save = async (file: string) =>
      app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      }, file);
    await page!.getByRole("button", { name: "Export", exact: true }).click();
    const modal = page!.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    const pdf = path.join(folder, "population.pdf");
    await save(pdf);
    await modal
      .getByRole("button", { name: "Export PDF report…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(pdf)).subarray(0, 5).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF-");
    const context = JSON.parse(
      await readFile(path.join(folder, "population.report.json"), "utf8"),
    );
    expect(context.run.config.sources[1].bubble.radius_m).toBe(1.5e-6);
    await expect(
      modal.getByRole("button", { name: "Export WebM video…", exact: true }),
    ).toBeEnabled();
    const videoPath = path.join(folder, "population.webm");
    await save(videoPath);
    await modal
      .getByLabel("Presentation video duration", { exact: true })
      .selectOption("2");
    await modal
      .getByRole("button", { name: "Export WebM video…", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          try {
            return (await readFile(videoPath)).length;
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(1000);
    const video = await readFile(videoPath),
      meta = JSON.parse(await readFile(videoPath + ".json", "utf8"));
    expect(video.readUInt32BE(0)).toBe(0x1a45dfa3);
    expect(meta.video.source_index).toBe(1);
    expect(meta.video.mode).toBe("bubble");
    expect(meta.video.sha256).toBe(
      createHash("sha256").update(video).digest("hex"),
    );
    expect(meta.results_h5_sha256).toBe(context.results_h5_sha256);
    const decoded = await page!.evaluate(
      (bytes) =>
        new Promise<{ width: number; height: number; duration: number }>(
          (resolve, reject) => {
            const element = document.createElement("video"),
              url = URL.createObjectURL(
                new Blob([Uint8Array.from(bytes)], { type: "video/webm" }),
              );
            const timer = setTimeout(() => {
              URL.revokeObjectURL(url);
              reject(new Error("WebM decode timed out"));
            }, 10000);
            element.onloadeddata = () => {
              clearTimeout(timer);
              URL.revokeObjectURL(url);
              resolve({
                width: element.videoWidth,
                height: element.videoHeight,
                duration: element.duration,
              });
            };
            element.onerror = () => {
              clearTimeout(timer);
              URL.revokeObjectURL(url);
              reject(new Error("WebM decode failed"));
            };
            element.src = url;
            element.load();
          },
        ),
      Array.from(video),
    );
    expect(decoded.width).toBe(960);
    expect(decoded.height).toBe(640);
    expect(decoded.duration).toBeCloseTo(2, 2);
    await expect(
      modal.getByRole("button", { name: "Close", exact: true }),
    ).toBeEnabled();
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await page
      ?.screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});
