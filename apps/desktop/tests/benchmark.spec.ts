import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  BenchmarkReport,
  Run,
  RunSummary,
} from "../../../packages/contracts";

test("PAM benchmark: actual scores, matched/scenario comparison, ROI and CSV/JSON exports", async ({}, info) => {
  test.setTimeout(150000);
  const folder = await mkdtemp(path.join(tmpdir(), "pam-benchmark-"));
  const project = path.join(folder, "project");
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
  let page = await app.firstWindow();
  const errors: string[] = [];
  const complete = async () => {
    await expect
      .poll(
        async () => {
          const job = (await page.evaluate(() =>
            window.pam.request("job"),
          )) as { status: string; error?: string };
          if (job.status === "failed") throw new Error(job.error);
          return job.status;
        },
        { timeout: 90000 },
      )
      .toBe("complete");
  };
  const save = async (file: string) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
  try {
    await expect
      .poll(
        () => {
          const p = app
            .windows()
            .find((p) => p.url() === "app://studio/index.html");
          if (p) page = p;
          return !!p;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")
        ?.setPosition(-3000, 0);
    });
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
    await page
      .getByRole("dialog", { name: "New project", exact: true })
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("33");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await complete();
    await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
    const table = page.getByRole("table", {
      name: "PAM benchmark results",
      exact: true,
    });
    await expect(table.getByRole("row")).toHaveCount(6);
    const runId = await page
      .getByLabel("Benchmark run", { exact: true })
      .inputValue();
    const report = (await page.evaluate(
      (id) =>
        window.pam.request("benchmark", {
          run_id: id,
          settings: { roi_radius_m: 0.002, histogram_bins: 100 },
        }),
      runId,
    )) as BenchmarkReport;
    const das = table.getByRole("row").filter({
      has: page.getByRole("button", { name: "Passive DAS", exact: true }),
    });
    await expect(das).toContainText(report.methods.das!.gcnr!.toFixed(3));
    await page
      .getByLabel("Benchmark truth ROI radius (mm)", { exact: true })
      .fill("3");
    await page
      .getByLabel("Benchmark histogram bins", { exact: true })
      .selectOption("32");
    await expect(table.getByRole("row")).toHaveCount(6);
    await page
      .getByRole("button", { name: "Export report JSON…", exact: true })
      .waitFor({ state: "visible" });
    const jsonFile = path.join(folder, "scores.json");
    await save(jsonFile);
    await page
      .getByRole("button", { name: "Export report JSON…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(jsonFile, "utf8")).reports[0]
            .settings.roi_radius_m;
        } catch {
          return 0;
        }
      })
      .toBe(0.003);
    // Export/reimport the actual immutable run: identical hashes should be matched.
    const bundle = path.join(folder, "same-run.zip");
    await save(bundle);
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
          return (await readFile(bundle)).byteLength;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(1000);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, bundle);
    await page
      .getByRole("menubar")
      .getByRole("menuitem", { name: "File", exact: true })
      .click();
    await page.getByRole("menuitem", { name: /Import experiment/ }).click();
    await expect
      .poll(
        async () =>
          (
            (await page.evaluate(() =>
              window.pam.request("runs"),
            )) as RunSummary[]
          ).filter((r) => r.status === "complete").length,
      )
      .toBe(2);
    await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await page
      .getByLabel("Benchmark reference run", { exact: true })
      .selectOption(runId);
    await expect(
      page.getByText("Matched RF and settings", { exact: true }),
    ).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(
      page.getByLabel("Metric changes from reference"),
    ).toContainText("+0.000");
    await page
      .getByRole("button", { name: "Inspect PAM", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Reconstruction", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("complementary", { name: "Project panel", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await expect(
      page.getByLabel("Benchmark reference run", { exact: true }),
    ).toHaveValue(runId);
    await page.getByRole("button", { name: "Inspect RF", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await expect(
      page.getByLabel("Benchmark truth ROI radius (mm)", { exact: true }),
    ).toHaveValue("3");
    await expect(
      page.getByLabel("Benchmark histogram bins", { exact: true }),
    ).toHaveValue("32");
    const csv = path.join(folder, "scores.csv");
    await save(csv);
    await page
      .getByRole("button", { name: "Export scores CSV…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(csv, "utf8")).trim().split(/\r?\n/).length;
        } catch {
          return 0;
        }
      })
      .toBe(11);
    expect((await readFile(csv, "utf8")).split(/\r?\n/)[0]).toContain("gcnr");
    expect((await readFile(csv, "utf8")).split(/\r?\n/)[0]).toContain(
      "delta_gcnr",
    );
    expect(await readFile(csv, "utf8")).not.toContain("\r\r\n");
    await page.screenshot({ path: info.outputPath("pam-benchmark.png") });
    // A genuine reanalysis with a different grid must be labelled as a scenario.
    const importedId = await page
      .getByLabel("Benchmark run", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Toggle Properties panel", exact: true })
      .click();
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("17");
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await complete();
    await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await page
      .getByLabel("Benchmark reference run", { exact: true })
      .selectOption(importedId);
    await expect(
      page.getByText("Scenario comparison", { exact: true }),
    ).toBeVisible();
    await page.getByText(/Inspect \d+ changed parameter/).click();
    await expect(
      page.getByRole("table", { name: "Changed experiment parameters" }),
    ).toContainText("analysis.grid_n");
    await page
      .getByRole("table", { name: "Changed experiment parameters" })
      .getByRole("row")
      .filter({ hasText: "analysis.grid_n" })
      .getByRole("cell", { name: "17", exact: true })
      .waitFor();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")!
        .setSize(1000, 720);
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("pam-benchmark-compact.png"),
    });
    expect(errors).toEqual([]);
  } finally {
    await page
      .screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});
