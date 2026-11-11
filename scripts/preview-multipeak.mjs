// Inspect actual three-source RF-derived maps through the native application.
import { _electron, expect } from "@playwright/test";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const evidence = JSON.parse(
  await readFile(".local/multipeak-evidence.json", "utf8"),
);
const profile = await mkdtemp(path.join(tmpdir(), "pam-peaks-preview-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  args: [`--user-data-dir=${profile}`, "."],
  env,
  timeout: 60000,
});
await app.evaluate(({ dialog }) => {
  globalThis.__pamPeakDialogs = {
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
  await page.getByRole("tab", { name: /^Runs/ }).click();
  await page
    .getByRole("table", { name: "Run history", exact: true })
    .getByRole("row")
    .filter({ hasText: evidence.run_id.slice(0, 8) })
    .getByRole("button")
    .click();
  await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
  await page
    .getByRole("button", { name: "Load saved settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Reconstruction", exact: true }).click();
  await page
    .getByRole("tablist", { name: "Reconstruction method", exact: true })
    .getByRole("tab", { name: "ATP", exact: true })
    .click();
  for (const name of [
    "Toggle Project panel",
    "Toggle Properties panel",
    "Toggle Output panel",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
  }
  await page.getByLabel("Profiles", { exact: true }).uncheck();
  await page.getByLabel("Peak threshold (dB)", { exact: true }).fill("-12");
  await page
    .getByLabel("Minimum peak separation (mm)", { exact: true })
    .fill("2");
  await expect(page.locator(".peak-results summary")).toContainText(
    "3/3 matched",
  );
  await page.locator(".peak-results summary").click();
  await expect(page.getByTestId("detected-peak")).toHaveCount(3);
  await page.screenshot({ path: "docs/images/multiple-source-pam.png" });
  await page
    .getByLabel("Truth matching tolerance (mm)", { exact: true })
    .fill("0.05");
  await expect(page.locator(".peak-results summary")).toContainText(
    "1/3 matched",
  );
  await expect(page.getByTestId("detected-peak")).toHaveCount(3);
  await page.screenshot({
    path: "docs/images/multiple-source-strict-tolerance.png",
  });
  await page
    .getByLabel("Truth matching tolerance (mm)", { exact: true })
    .fill("2");
  await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
  await expect(
    page
      .getByRole("table", {
        name: "Per-source localization matches",
        exact: true,
      })
      .getByRole("row"),
  ).toHaveCount(4);
  await page
    .getByRole("table", {
      name: "Per-source localization matches",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/images/multiple-source-benchmark.png" });
  await page.getByRole("tab", { name: "Reconstruction", exact: true }).click();
  await expect(page.getByTestId("detected-peak")).toHaveCount(3);
  await expect(page.locator(".peak-results summary")).toContainText(
    "3/3 matched",
  );
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = globalThis.__pamPeakDialogs.open;
    dialog.showSaveDialog = globalThis.__pamPeakDialogs.save;
    delete globalThis.__pamPeakDialogs;
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    ".local/multipeak-preview.json",
    JSON.stringify(
      {
        project: evidence.project,
        run_id: evidence.run_id,
        settings: evidence.settings,
        renderer_errors: errors,
        native_dialogs_restored: true,
        electron_launcher_pid: app.process().pid,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Three real RF-derived peaks matched to three sources; tolerance changes assignments only; no renderer errors. Launcher PID",
    app.process().pid,
  );
  if (process.argv.includes("--keep-open"))
    await new Promise((resolve) => app.process().once("exit", resolve));
} finally {
  await app.close();
}
