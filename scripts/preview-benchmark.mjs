// Inspect the real saved synthetic benchmark through the native desktop UI.
import { _electron, expect } from "@playwright/test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const fixtureFolder = argument("--fixture", "examples/pam_benchmark"),
  prefix = argument("--prefix", "pam-benchmark");
const fixture = JSON.parse(
  await readFile(`${fixtureFolder}/BENCHMARK.json`, "utf8"),
);
const profile = await mkdtemp(path.join(tmpdir(), "pam-benchmark-preview-"));
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
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, fixture.project);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("tab", { name: "Benchmark", exact: true }).click();
  await page
    .getByLabel("Benchmark run", { exact: true })
    .selectOption(fixture.packages.alternate_aperture.run_id);
  await page
    .getByLabel("Benchmark reference run", { exact: true })
    .selectOption(fixture.packages.full_aperture.run_id);
  await expect(
    page
      .getByRole("table", { name: "PAM benchmark results", exact: true })
      .getByRole("row"),
  ).toHaveCount(11);
  await expect(
    page.getByText("Scenario comparison", { exact: true }),
  ).toBeVisible();
  if (process.argv.includes("--show-changes"))
    await page.getByText(/Inspect \d+ changed parameter/).click();
  await page.screenshot({ path: `docs/images/${prefix}.png` });
  await page.locator(".benchmark-maps").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("img", { name: /Current · Passive DAS;/ }),
  ).toBeAttached();
  await page.screenshot({ path: `docs/images/${prefix}-maps.png` });
  await page.locator(".benchmark-controls").scrollIntoViewIfNeeded();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `Opened actual PAM benchmark, ten method/run rows, truth disks and paired maps; no renderer errors. PID ${app.process().pid}`,
  );
  if (process.argv.includes("--keep-open"))
    await new Promise((resolve) => app.process().once("exit", resolve));
} finally {
  await app.close();
}
