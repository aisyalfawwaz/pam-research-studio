import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { ProjectInfo, Run, RunSummary } from "../../../packages/contracts";
import type { Workflow } from "../../../packages/contracts/workflow";

test("workspace coherence: method/DSP graph, saved options, fresh projects and preset execution", async ({}, info) => {
  test.setTimeout(150000);
  const folder = await mkdtemp(path.join(tmpdir(), "pam-workspace-"));
  const a = path.join(folder, "a"),
    b = path.join(folder, "b");
  await Promise.all([mkdir(a), mkdir(b)]);
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
    await expect(
      page!.getByRole("button", { name: "New", exact: true }),
    ).toBeEnabled();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === "app://studio/index.html")!
        .setPosition(-3000, 0);
    });
    const choose = async (folder: string) =>
      app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, folder);
    const create = async (folder: string) => {
      await choose(folder);
      await page!.getByRole("button", { name: "New", exact: true }).click();
      await page!
        .getByRole("dialog", { name: "New project", exact: true })
        .getByRole("button", { name: "Create", exact: true })
        .click();
    };
    const saved = async () =>
      page!.evaluate(() =>
        window.pam.request("projectInfo"),
      ) as Promise<ProjectInfo>;
    const graph = async () =>
      page!.evaluate(() => window.pam.request("workflow")) as Promise<Workflow>;
    const complete = async () =>
      expect
        .poll(
          async () => {
            const job = (await page!.evaluate(() =>
              window.pam.request("job"),
            )) as { status: string; error?: string };
            if (job.status === "failed") throw new Error(job.error);
            return job.status;
          },
          { timeout: 90000 },
        )
        .toBe("complete");
    await create(a);
    const errors: string[] = [];
    page!.on("pageerror", (e) => errors.push(e.message));
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page!.getByRole("button", { name: "DAS only", exact: true }).click();
    await page!.getByRole("checkbox", { name: /CF-DAS/ }).check();
    await page!.getByRole("checkbox", { name: /Passive DAS/ }).uncheck();
    await page!
      .getByRole("spinbutton", { name: "Amplitude exponent", exact: true })
      .fill("2.5");
    await page!
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("33");
    await page!
      .getByRole("checkbox", {
        name: "Enable receive conditioning",
        exact: true,
      })
      .check();
    await expect
      .poll(async () => {
        const g = await graph();
        return (
          !!g &&
          g.analysis?.cf_exponent === 2.5 &&
          g.nodes.some((n) => n.kind === "dsp") &&
          g.nodes.filter((n) => n.kind === "reconstruct").length === 1
        );
      })
      .toBe(true);
    await page!
      .getByRole("tab", { name: "Model builder", exact: true })
      .click();
    await page!.getByRole("button", { name: "Run model", exact: true }).click();
    await complete();
    const runs = (await page!.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const record = (await page!.evaluate(
      (id) => window.pam.request("run", id),
      runs.find((r) => r.status === "complete")!.id,
    )) as Run;
    expect(Object.keys(record.methods)).toEqual(["cf"]);
    expect(record.config.processing).toBeTruthy();
    await create(b);
    await expect
      .poll(async () => {
        const g = await graph();
        return g?.analysis?.cf_exponent;
      })
      .toBe(1);
    expect((await saved()).draft.grid_n).toBe(128);
    await choose(a);
    await page!.getByRole("button", { name: "Open", exact: true }).click();
    await expect
      .poll(async () => {
        const g = await graph();
        return g?.analysis?.cf_exponent;
      })
      .toBe(2.5);
    await page!.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await expect(
      page!
        .getByRole("table", { name: "PAM benchmark results", exact: true })
        .getByRole("row"),
    ).toHaveCount(2);
    await page!
      .getByRole("button", { name: "Load saved settings", exact: true })
      .click();
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await expect(
      page!.getByRole("spinbutton", {
        name: "Amplitude exponent",
        exact: true,
      }),
    ).toHaveValue("2.5");
    await page!
      .getByRole("spinbutton", { name: "Amplitude exponent", exact: true })
      .fill("1");
    await page!.getByRole("tab", { name: "Benchmark", exact: true }).click();
    await page!
      .getByRole("button", { name: "Load saved settings", exact: true })
      .click();
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await expect(
      page!.getByRole("spinbutton", {
        name: "Amplitude exponent",
        exact: true,
      }),
    ).toHaveValue("2.5");
    await page!.getByRole("button", { name: "Preset", exact: true }).click();
    await page!.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page!
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("17");
    await expect
      .poll(async () => {
        const g = await graph();
        return g?.nodes.some((n) => n.kind === "dsp");
      })
      .toBe(false);
    await page!
      .getByRole("tab", { name: "Model builder", exact: true })
      .click();
    await page!.getByRole("button", { name: "Run model", exact: true }).click();
    await complete();
    expect(errors).toEqual([]);
    await expect
      .poll(async () => {
        const records = (await page!.evaluate(() =>
          window.pam.request("runs"),
        )) as RunSummary[];
        return records.filter((r) => r.status === "complete").length;
      })
      .toBe(2);
    await page!.screenshot({ path: info.outputPath("workspace-restored.png") });
  } finally {
    await page
      ?.screenshot({ path: info.outputPath("final-workspace.png") })
      .catch(() => {});
    await app.close();
  }
});
