// Manual inspection of the explicitly requested public reference, outside CI/tests.
import { _electron, expect } from "@playwright/test";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const reference = process.argv.includes("--patch")
  ? "ct_skull_patch"
  : "ct_head_slice";
const benchmark = JSON.parse(
  await readFile(`examples/${reference}/BENCHMARK.json`, "utf8"),
);
const profile = await mkdtemp(path.join(tmpdir(), "pam-public-reference-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  args: [`--user-data-dir=${profile}`, "."],
  env,
  timeout: 60000,
});
const keep = process.argv.includes("--keep-open");
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
  await app.evaluate(({ dialog }, project) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [project],
    });
  }, benchmark.project);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("tab", { name: "CT medium", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "CT anatomy with simulation crop, sources and receivers",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /CT medium · DAS;/ }),
  ).toBeAttached();
  await mkdir("docs/images", { recursive: true });
  await page.screenshot({ path: `docs/images/${reference}-anatomy.png` });
  await page.locator(".ct-comparison").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/images/${reference}-comparison.png` });
  // Select the immutable CT run through the ordinary project UI for replay.
  await page
    .getByRole("button", { name: "Toggle Project panel", exact: true })
    .click()
    .catch(() => {});
  const result = page.getByRole("button", { name: /Run 002/ }).first();
  if (await result.count()) {
    await result.click();
    await page
      .getByRole("tab", { name: "Live simulation", exact: true })
      .click();
    const slider = page.getByRole("slider", {
      name: "Wave frame",
      exact: true,
    });
    await expect
      .poll(async () => Number(await slider.getAttribute("max")))
      .toBeGreaterThan(1);
    await slider.evaluate((element) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(element, String(Math.round(Number(element.max) * 0.35)));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.screenshot({ path: `docs/images/${reference}-replay.png` });
    await page.getByRole("tab", { name: "CT medium", exact: true }).click();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `Opened actual ${reference}; anatomy and paired maps inspected; no renderer errors. PID ${app.process().pid}`,
  );
  if (keep) await new Promise((resolve) => app.process().once("exit", resolve));
} finally {
  await app.close();
}
