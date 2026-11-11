import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { BenchmarkEvaluation } from "../../../packages/contracts";

test("multiple sources: independent peaks, tolerance, truth assignments and reproducible reports", async ({}, info) => {
  test.setTimeout(150000);
  const folder = await mkdtemp(path.join(tmpdir(), "pam-peaks-")),
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
  const errors: string[] = [];
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
    page!.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")
        ?.setPosition(-3000, 0);
    });
    await expect(
      page!.getByRole("button", { name: "New", exact: true }),
    ).toBeEnabled();
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
    await expect(
      page!.getByRole("button", { name: "Simulate", exact: true }),
    ).toBeEnabled();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, path.resolve("examples/multiple_sources/experiment.zip"));
    await page!
      .getByRole("menubar")
      .getByRole("menuitem", { name: "File", exact: true })
      .click();
    await page!
      .getByRole("menu", { name: "File menu", exact: true })
      .locator("button")
      .filter({ hasText: "Import experiment…" })
      .click();
    await page!
      .getByRole("tablist", { name: "Reconstruction method", exact: true })
      .getByRole("tab", { name: "ATP", exact: true })
      .click();
    await page!
      .getByLabel("Minimum peak separation (mm)", { exact: true })
      .fill("2");
    await page!.getByLabel("Peak threshold (dB)", { exact: true }).fill("-12");
    await expect(page!.getByTestId("detected-peak")).toHaveCount(3);
    await expect(page!.locator(".peak-results summary")).toContainText(
      "3/3 matched",
    );
    await page!.locator(".peak-results summary").click();
    const truth = page!.getByRole("table", {
      name: "Per-source localization matches",
      exact: true,
    });
    await expect(
      truth.getByRole("row").filter({ hasText: "Matched" }),
    ).toHaveCount(3);
    await page!.screenshot({ path: info.outputPath("three-source-pam.png") });
    await page!
      .getByLabel("Truth matching tolerance (mm)", { exact: true })
      .fill("0.05");
    await expect(page!.locator(".peak-results summary")).toContainText(
      "1/3 matched",
    );
    await expect(page!.getByTestId("detected-peak")).toHaveCount(3);
    await expect(
      truth.getByRole("row").filter({ hasText: "Missed" }),
    ).toHaveCount(2);
    await page!
      .getByLabel("Truth matching tolerance (mm)", { exact: true })
      .fill("2");
    await expect(page!.locator(".peak-results summary")).toContainText(
      "3/3 matched",
    );
    await page!.getByLabel("Peak threshold (dB)", { exact: true }).fill("-6");
    await expect(page!.getByTestId("detected-peak")).toHaveCount(2);
    await expect(page!.locator(".peak-results summary")).toContainText(
      "2/3 matched",
    );
    await page!.getByLabel("Peak threshold (dB)", { exact: true }).fill("-12");
    await page!
      .getByLabel("Minimum peak separation (mm)", { exact: true })
      .fill("15");
    await expect(page!.getByTestId("detected-peak")).toHaveCount(1);
    await page!
      .getByLabel("Minimum peak separation (mm)", { exact: true })
      .fill("2");
    await expect(page!.getByTestId("detected-peak")).toHaveCount(3);
    await page!.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await expect(
      page!
        .getByRole("table", {
          name: "Per-source localization matches",
          exact: true,
        })
        .getByRole("row"),
    ).toHaveCount(4);
    const save = async (file: string) =>
      app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      }, file);
    const json = path.join(folder, "peaks.json");
    await save(json);
    await page!
      .getByRole("button", { name: "Export report JSON…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(json, "utf8")).reports?.length;
        } catch {
          return 0;
        }
      })
      .toBe(1);
    const report = (
      JSON.parse(await readFile(json, "utf8")) as BenchmarkEvaluation
    ).reports[0];
    expect(report.version).toBe("1.2.0");
    expect(report.settings.peaks?.threshold_db).toBe(-12);
    expect(report.methods.atp?.matched_sources).toBe(3);
    expect(report.methods.atp?.detections?.peaks).toHaveLength(3);
    const pdf = path.join(folder, "peaks.pdf");
    await save(pdf);
    await page!.getByRole("button", { name: "Export", exact: true }).click();
    const modal = page!.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
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
      await readFile(path.join(folder, "peaks.report.json"), "utf8"),
    );
    expect(context.benchmark.settings.peaks.threshold_db).toBe(-12);
    expect(context.benchmark.methods.atp.matched_sources).toBe(3);
    expect(context.benchmark.fingerprints.raw_rf).toBe(
      report.fingerprints.raw_rf,
    );
    expect(context.benchmark.methods.atp.map_sha256).toBe(
      report.methods.atp?.map_sha256,
    );
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await page!
      .getByRole("table", { name: "PAM benchmark results", exact: true })
      .getByRole("button", { name: "CF-DAS", exact: true })
      .click();
    await page!
      .getByRole("tab", { name: "Reconstruction", exact: true })
      .click();
    await page!
      .getByRole("tablist", { name: "Reconstruction method", exact: true })
      .getByRole("tab", { name: "ATP", exact: true })
      .click();
    await page!.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await expect(page!.getByTestId("detected-peak")).toHaveCount(3);
    await page!
      .getByRole("tab", { name: "Reconstruction", exact: true })
      .click();
    await expect(page!.getByTestId("detected-peak")).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    await page
      ?.screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});
