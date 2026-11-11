import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Run, RunSummary } from "../../../packages/contracts";

test("startup identity, scientific credits and offline splash security", async ({}, testInfo) => {
  const folder = await mkdtemp(path.join(tmpdir(), "pam-startup-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [`--user-data-dir=${folder}`, "."],
    env,
    timeout: 60000,
  });
  let page: Page = await app.firstWindow();
  try {
    let splash: Page | undefined;
    await expect
      .poll(
        () => {
          splash = app
            .windows()
            .find((p) => p.url() === "app://studio/splash.html");
          return !!splash;
        },
        { timeout: 10000 },
      )
      .toBe(true);
    await expect(
      splash!.getByText("Aisy Fawwaz", { exact: true }),
    ).toBeVisible();
    await expect(
      splash!.getByText("Imperial College London", { exact: true }),
    ).toBeVisible();
    await expect(splash!.getByText(/Callum Rhys Tilbury/)).toBeVisible();
    await expect(splash!.getByText(/Antonio Stanziola/)).toBeVisible();
    expect(await splash!.evaluate(() => typeof window.pam)).toBe("undefined");
    expect(
      await splash!.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
    await splash!.screenshot({
      path: testInfo.outputPath("startup-splash.png"),
    });
    page = await workspaceWindow(app);
    await expect(
      page.getByRole("button", { name: "New", exact: true }),
    ).toBeEnabled();
    await menu(page, "Help", "About & credits…");
    const about = page.getByRole("dialog", {
      name: "About PAM Research Studio",
      exact: true,
    });
    await expect(about.getByText("Aisy Fawwaz", { exact: true })).toBeVisible();
    await expect(about.getByText(/Stanziola, Simon/)).toBeVisible();
    await expect(
      about.getByText("doi:10.1109/TSP.2003.812831", { exact: true }),
    ).toBeAttached();
    await page.screenshot({ path: testInfo.outputPath("about-credits.png") });
    await about.getByRole("button", { name: "Close", exact: true }).click();
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("1024 channels: actual RF preview, final receiver, paged aperture and reconstruction", async ({}, testInfo) => {
  const { app, page, folder } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await create(page);
    await page
      .getByRole("spinbutton", { name: "Array pitch (mm)", exact: true })
      .fill("0.05");
    await page
      .getByRole("spinbutton", { name: "Array elements", exact: true })
      .fill("1024");
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page.getByRole("button", { name: "DAS only", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("17");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await page
      .getByRole("spinbutton", { name: "Selected channel", exact: true })
      .fill("1023");
    await expect(
      page.getByRole("img", { name: /Channel waveform;/ }),
    ).toBeVisible();
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const preview = await page.evaluate(async (id) => {
      const a = await window.pam.array(id, "rf");
      return { shape: a.shape, bytes: a.buffer.byteLength };
    }, runs[0].id);
    expect(preview).toEqual({ shape: [512, 1024], bytes: 2097152 });
    await page.screenshot({ path: testInfo.outputPath("rf-1024.png") });
    const csv = path.join(folder, "receiver-1023.csv");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, csv);
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(csv)).byteLength;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(1000);
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Passive DAS ·/ }),
    ).toBeVisible();
    await page.getByText("Receive aperture", { exact: true }).click();
    await page.getByLabel("Channel range", { exact: true }).selectOption("15");
    await expect(
      page.getByRole("checkbox", { name: "Use receiver 1023", exact: true }),
    ).toBeVisible();
    expect(
      await page.getByRole("checkbox", { name: /Use receiver/ }).count(),
    ).toBe(64);
    await page.getByRole("button", { name: "Spaced 64", exact: true }).click();
    await expect(
      page.getByText("64 of 1024 active.", { exact: false }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("coupled model builder: real graph editing, multi-array layout, live fields and complete PAM", async ({}, testInfo) => {
  test.setTimeout(180000);
  test.skip(
    !existsSync(".adapters/jwave/.venv/Scripts/python.exe") ||
      !existsSync(".adapters/jbubble/.venv/Scripts/python.exe"),
    "Install both optional runtimes",
  );
  const { app, page, folder } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await create(page);
    await page.getByRole("tab", { name: "Model builder", exact: true }).click();
    await page
      .getByRole("button", { name: "Load template", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Expand canvas", exact: true })
      .click();
    await page.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(page.getByText(/Graph is ready\./)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("workflow-coupled.png"),
    });
    const drive = page.getByRole("button", {
      name: "Block Acoustic drive",
      exact: true,
    });
    const before = await drive.getAttribute("transform");
    const box = await drive.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 12);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + 32, {
      steps: 5,
    });
    await page.mouse.up();
    expect(await drive.getAttribute("transform")).not.toBe(before);
    await page
      .getByRole("button", { name: "Undo workflow edit", exact: true })
      .click();
    await expect(drive).toHaveAttribute("transform", before!);
    await page.getByRole("button", { name: "Run model", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Live simulation", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("img", {
        name: "Acoustic pressure · actual j-Wave field",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    const snapshots: number[] = [];
    await expect
      .poll(
        async () => {
          const frame = (await page.evaluate(() =>
            window.pam.request("live"),
          )) as { time_s?: number };
          if (frame.time_s && !snapshots.includes(frame.time_s))
            snapshots.push(frame.time_s);
          return snapshots.length;
        },
        { timeout: 90000 },
      )
      .toBeGreaterThan(1);
    await page.screenshot({ path: testInfo.outputPath("workflow-live.png") });
    await expect
      .poll(
        async () => {
          const job = (await page.evaluate(() =>
            window.pam.request("job"),
          )) as { status: string; error?: string };
          if (job.status === "failed") throw new Error(job.error);
          return job.status;
        },
        { timeout: 150000 },
      )
      .toBe("complete");
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const run = (await page.evaluate(
      (id) => window.pam.request("run", id),
      runs[0].id,
    )) as Run;
    expect(run.config.arrays).toHaveLength(2);
    expect(run.config.channels).toBe(32);
    expect((run.provenance.simulation as { id: string }).id).toBe(
      "jbubble-jwave",
    );
    expect(run.provenance.workflow).toBeTruthy();
    expect(Object.keys(run.metrics!.methods)).toHaveLength(5);
    const savedGraph = (await page.evaluate(() =>
      window.pam.request("workflow"),
    )) as { analysis: { atp_emission_s: number } };
    expect(savedGraph.analysis.atp_emission_s).toBe(8e-6);
    const delay = (
      run.provenance.simulation as { coupling: { source_delay_s: number } }
    ).coupling.source_delay_s;
    expect(
      (run.provenance.reconstruction_options as { atp_emission_s: number })
        .atp_emission_s,
    ).toBeCloseTo(8e-6 + delay, 12);
    await expect(
      page.getByRole("slider", { name: "Wave frame", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("slider", { name: "Wave frame", exact: true })
      .fill("80");
    await page.screenshot({ path: testInfo.outputPath("workflow-replay.png") });
    const archive = path.join(folder, "coupled.zip");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, archive);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    await dialog.getByLabel("Include raw RF data").check();
    await dialog.getByRole("button", { name: "Export ZIP…" }).click();
    await expect
      .poll(
        async () => {
          try {
            return (await readFile(archive)).byteLength;
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(1000);
    expect(errors).toEqual([]);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("receive arrays: dimensions, pose dragging, undo and immutable RF captures", async ({}, testInfo) => {
  const { app, page } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await create(page);
    const field = (name: string) =>
      page.getByRole("spinbutton", { name, exact: true });
    await field("Number of arrays").fill("2");
    await page.getByLabel("Receive array", { exact: true }).selectOption("1");
    await field("Array elements").fill("12");
    await field("Array aperture (mm)").fill("4.4");
    await field("Array centre x (mm)").fill("8");
    await field("Array centre z (mm)").fill("6");
    await field("Array angle (°)").fill("60");
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    const array = page.getByRole("button", {
      name: "Select receive array 2",
      exact: true,
    });
    await array.focus();
    await page.keyboard.press("ArrowRight");
    await expect(field("Array centre x (mm)")).toHaveValue("8.1");
    await page
      .getByRole("button", { name: "Undo model edit", exact: true })
      .click();
    await expect(field("Array centre x (mm)")).toHaveValue("8");
    const box = await array.locator(".array-drag-target").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2 + 25,
      box!.y + box!.height / 2 + 15,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(field("Array centre x (mm)")).not.toHaveValue("8");
    await page
      .getByRole("button", { name: "Undo model edit", exact: true })
      .click();
    await expect(field("Array centre x (mm)")).toHaveValue("8");
    await expect(field("Array centre z (mm)")).toHaveValue("6");
    await page.screenshot({
      path: testInfo.outputPath("multi-array-layout.png"),
    });
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    const first = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const record = (await page.evaluate(
      (id) => window.pam.request("run", id),
      first[0].id,
    )) as Run;
    expect(record.config.channels).toBe(76);
    expect(record.config.arrays![1].pitch_m).toBeCloseTo(0.0004, 12);
    expect(record.config.arrays![1].angle_deg).toBe(60);
    const before = await page.evaluate(
      async (id) =>
        Array.from(
          new Float32Array((await window.pam.array(id, "trace", 65)).buffer),
        ),
      record.id,
    );
    await field("Array centre x (mm)").fill("12");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            (await page.evaluate(() =>
              window.pam.request("runs"),
            )) as RunSummary[]
          ).filter((r) => r.status === "simulated").length,
      )
      .toBe(2);
    const after = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const changed = after.find((r) => r.id !== record.id)!;
    const second = await page.evaluate(
      async (id) =>
        Array.from(
          new Float32Array((await window.pam.array(id, "trace", 65)).buffer),
        ),
      changed.id,
    );
    expect(second).not.toEqual(before);
    expect(
      await page.evaluate((id) => window.pam.request("run", id), record.id),
    ).toEqual(record);
    expect(errors).toEqual([]);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("j-Wave native CPU: select solver, simulate actual RF, reconstruct five methods", async ({}, testInfo) => {
  test.skip(
    !existsSync(
      path.join(
        ".adapters/jwave/.venv",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      ),
    ),
    "Install optional runtime with scripts/setup-jwave.ps1",
  );
  const { app, page } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await create(page);
    const solver = page.getByLabel("Solver", { exact: true });
    await expect
      .poll(async () => solver.locator('option[value="jwave"]').isEnabled(), {
        timeout: 60000,
      })
      .toBe(true);
    await solver.selectOption("jwave");
    await expect(
      page.getByRole("spinbutton", {
        name: "Propagation spacing (mm)",
        exact: true,
      }),
    ).toHaveValue("0.2");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible({
      timeout: 90000,
    });
    await page.screenshot({
      path: testInfo.outputPath("instrument-jwave-rf.png"),
    });
    const simulated = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const capture = (await page.evaluate(
      (id) => window.pam.request("run", id),
      simulated[0].id,
    )) as Run;
    const provenance = capture.provenance.simulation as {
      id: string;
      packages: Record<string, string>;
      plan: { dimension: string };
    };
    expect(provenance.id).toBe("jwave");
    expect(provenance.packages.jwave).toBe("0.2.1");
    expect(provenance.plan.dimension).toContain("2D");
    await page.keyboard.press("F6");
    await expect(
      page.getByRole("table", { name: "Reconstruction measurements" }),
    ).toBeVisible({ timeout: 90000 });
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const result = (await page.evaluate(
      (id) => window.pam.request("run", id),
      runs.find((r) => r.status === "complete")!.id,
    )) as Run;
    expect(Object.keys(result.metrics!.methods).sort()).toEqual([
      "atp",
      "cf",
      "das",
      "rcb",
      "tea",
    ]);
    for (const metric of Object.values(result.metrics!.methods))
      expect(metric!.localization_error_m).toBeLessThan(0.002);
    expect(result.provenance.simulation).toEqual(capture.provenance.simulation);
    await page.screenshot({
      path: testInfo.outputPath("instrument-jwave-das.png"),
    });
    expect(errors).toEqual([]);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("jBubble CPU: physical controls, radius and emission plots, RF and five PAM methods", async ({}, testInfo) => {
  test.skip(
    !existsSync(
      path.join(
        ".adapters/jbubble/.venv",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      ),
    ),
    "Install optional runtime with scripts/setup-jbubble.ps1",
  );
  const { app, page, folder } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await create(page);
    const solver = page.getByLabel("Solver", { exact: true });
    await expect
      .poll(async () => solver.locator('option[value="jbubble"]').isEnabled(), {
        timeout: 60000,
      })
      .toBe(true);
    await solver.selectOption("jbubble");
    await expect(
      page.getByRole("spinbutton", {
        name: "Equilibrium radius (µm)",
        exact: true,
      }),
    ).toHaveValue("2");
    await expect(
      page.getByRole("spinbutton", {
        name: "Drive pressure (kPa)",
        exact: true,
      }),
    ).toHaveValue("100");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible({
      timeout: 90000,
    });
    await page
      .getByRole("tablist", { name: "Workspace views" })
      .getByRole("tab", { name: "Bubble dynamics", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Bubble radius;/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Radiated emission at 1 mm;/ }),
    ).toBeVisible();
    await expect(page.getByText(/Keller–Miksis · Converged/)).toBeVisible();
    const acquisition = await page.evaluate(async () => {
      const job = (await window.pam.request("job")) as { run_id: string };
      const trace = await window.pam.array(job.run_id, "bubble");
      const data = new Float32Array(trace.buffer);
      let min = 1,
        max = 1;
      for (let i = 1; i < data.length; i += 6) {
        if (data[i] < data[min]) min = i;
        if (data[i] > data[max]) max = i;
      }
      return {
        min: data[min],
        max: data[max],
        minTime: data[min - 1] * 1e6,
        maxTime: data[max - 1] * 1e6,
      };
    });
    const boundary = page.getByTestId("bubble-boundary"),
      timeSlider = page.getByRole("slider", {
        name: "Bubble time (µs)",
        exact: true,
      });
    await page
      .getByRole("button", { name: "Maximum expansion", exact: true })
      .click();
    expect(Number(await boundary.getAttribute("data-radius-m"))).toBeCloseTo(
      acquisition.max,
      12,
    );
    await expect(boundary).toHaveAttribute(
      "data-shell-regime",
      "Shell rupture regime",
    );
    await expect(page.locator(".line-time-cursor")).toHaveCount(4);
    const maximumSize = Number(await boundary.getAttribute("r"));
    await page.screenshot({
      path: testInfo.outputPath("bubble-maximum-expansion.png"),
    });
    await page
      .getByRole("button", { name: "Minimum radius", exact: true })
      .click();
    expect(Number(await boundary.getAttribute("data-radius-m"))).toBeCloseTo(
      acquisition.min,
      12,
    );
    await expect(boundary).toHaveAttribute(
      "data-shell-regime",
      "Buckled regime",
    );
    const minimumSize = Number(await boundary.getAttribute("r"));
    expect(maximumSize / minimumSize).toBeCloseTo(
      acquisition.max / acquisition.min,
      8,
    );
    await page.screenshot({
      path: testInfo.outputPath("bubble-minimum-radius.png"),
    });
    await page
      .getByRole("button", { name: "Play bubble playback", exact: true })
      .click();
    await expect
      .poll(async () =>
        Math.abs(
          Number(await boundary.getAttribute("data-radius-m")) -
            acquisition.min,
        ),
      )
      .toBeGreaterThan(1e-9);
    await page
      .getByRole("button", { name: "Pause bubble playback", exact: true })
      .click();
    const paused = await boundary.getAttribute("data-radius-m");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(await boundary.getAttribute("data-radius-m")).toBe(paused);
    await page
      .getByRole("button", {
        name: "First shell rupture crossing",
        exact: true,
      })
      .click();
    await expect(timeSlider).toBeEnabled();
    await page.getByRole("img", { name: /^Bubble radius;/ }).focus();
    await page.keyboard.press("Home");
    expect(Number(await timeSlider.inputValue())).toBeCloseTo(
      Number(await timeSlider.getAttribute("min")),
      8,
    );
    await page
      .getByRole("button", { name: "Next bubble sample", exact: true })
      .click();
    expect(Number(await timeSlider.inputValue())).toBeGreaterThan(
      Number(await timeSlider.getAttribute("min")),
    );
    await page.getByRole("checkbox", { name: "Loop", exact: true }).uncheck();
    const end = Number(await timeSlider.getAttribute("max"));
    await timeSlider.fill(String(end - 0.01));
    await page
      .getByRole("button", { name: "Play bubble playback", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Play bubble playback", exact: true }),
    ).toBeVisible();
    expect(Number(await timeSlider.inputValue())).toBeCloseTo(end, 8);
    await page
      .getByRole("button", { name: "Maximum expansion", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("instrument-jbubble-dynamics.png"),
    });
    await page.keyboard.press("F6");
    await expect(
      page.getByRole("table", { name: "Reconstruction measurements" }),
    ).toBeVisible({ timeout: 90000 });
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const result = (await page.evaluate(
      (id) => window.pam.request("run", id),
      runs.find((r) => r.status === "complete")!.id,
    )) as Run;
    const simulation = result.provenance.simulation as {
      id: string;
      max_radius_ratio: number;
      max_wall_mach: number;
      converged: boolean;
      packages: Record<string, string>;
    };
    expect(simulation.id).toBe("jbubble");
    expect(simulation.converged).toBe(true);
    expect(simulation.packages.jbubble).toBe("0.2.0");
    expect(simulation.max_radius_ratio).toBeGreaterThan(1.1);
    expect(simulation.max_wall_mach).toBeLessThan(0.1);
    expect(Object.keys(result.metrics!.methods).sort()).toEqual([
      "atp",
      "cf",
      "das",
      "rcb",
      "tea",
    ]);
    for (const metric of Object.values(result.metrics!.methods))
      expect(Number.isFinite(metric!.localization_error_m)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("instrument-jbubble-das.png"),
    });
    await page
      .getByRole("tablist", { name: "Workspace views" })
      .getByRole("tab", { name: "Bubble dynamics", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Bubble radius;/ }),
    ).toBeVisible();
    const archive = path.join(folder, "bubble-no-rf.zip");
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, archive);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const exportDialog = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    await exportDialog.getByLabel("Include raw RF data").uncheck();
    await exportDialog
      .getByRole("button", { name: "Export ZIP…", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(archive)).byteLength;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(1000);
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [target],
      });
    }, archive);
    await menu(page, "File", "Import experiment…");
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
    await page
      .getByRole("tablist", { name: "Workspace views" })
      .getByRole("tab", { name: "Bubble dynamics", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Maximum expansion", exact: true })
      .click();
    expect(Number(await boundary.getAttribute("data-radius-m"))).toBeCloseTo(
      acquisition.max,
      12,
    );
    expect(errors).toEqual([]);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

async function launch() {
  const folder = await mkdtemp(path.join(tmpdir(), "pam-instrument-"));
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
  const page = await workspaceWindow(app);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL() === "app://studio/index.html")
      ?.setPosition(-3000, 0);
  });
  await page.evaluate(() => {
    const trace: string[] = [];
    (window as unknown as { testInputTrace: string[] }).testInputTrace = trace;
    for (const type of ["click", "keydown"])
      document.addEventListener(
        type,
        (event) => {
          trace.push(
            `${type} ${event instanceof KeyboardEvent ? event.key : ""} ${(event.target as HTMLElement)?.textContent?.slice(0, 80)}`,
          );
          if (trace.length > 100) trace.shift();
        },
        true,
      );
  });
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await app.evaluate(({ dialog }, project) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [project],
    });
  }, project);
  return { app, page, project, folder };
}
async function workspaceWindow(app: ElectronApplication) {
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
  return page!;
}
async function create(page: Page) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page
    .getByRole("dialog", { name: "New project", exact: true })
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Simulate", exact: true }),
  ).toBeEnabled();
}
async function menu(page: Page, name: string, item: RegExp | string) {
  await page
    .getByRole("menubar")
    .getByRole("menuitem", { name, exact: true })
    .click();
  await page
    .getByRole("menu", { name: `${name} menu`, exact: true })
    .locator("button")
    .filter({ hasText: item })
    .click();
}
async function snapshotOnFailure(
  app: ElectronApplication,
  page: Page,
  testInfo: TestInfo,
) {
  {
    await testInfo.attach("workspace", {
      body: await page
        .locator("body")
        .innerText()
        .catch(() => ""),
      contentType: "text/plain",
    });
    await testInfo.attach("test-input", {
      body: JSON.stringify(
        await page
          .evaluate(
            () =>
              (window as unknown as { testInputTrace?: string[] })
                .testInputTrace || [],
          )
          .catch(() => []),
      ),
      contentType: "application/json",
    });
    await page
      .screenshot({ path: testInfo.outputPath("final-workspace.png") })
      .catch(() => {});
  }
  await app.close();
}

test("instrument workspace: five methods, data inspection, layouts, export and reimport", async ({}, testInfo) => {
  const { app, page, folder, project } = await launch();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Untrusted IPC"))
      console.log("Renderer:", m.text());
  });
  try {
    await create(page);
    await page.getByRole("button", { name: "Preset", exact: true }).click();
    await expect(
      page.getByRole("img", {
        name: "Scene geometry with receive array and passive sources",
      }),
    ).toBeVisible();
    // Native instrument geometry supports keyboard source editing and actual undo.
    await page
      .getByRole("button", { name: "Select source 1", exact: true })
      .focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("spinbutton", { name: "Source 1 x (mm)", exact: true }),
    ).toHaveValue("0.1");
    await page
      .getByRole("button", { name: "Undo model edit", exact: true })
      .click();
    await expect(
      page.getByRole("spinbutton", { name: "Source 1 x (mm)", exact: true }),
    ).toHaveValue("0");
    await page.screenshot({
      path: testInfo.outputPath("instrument-scene.png"),
    });
    await page.keyboard.press("F5");
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Channel waveform;/ }),
    ).toBeVisible();
    await page
      .getByRole("spinbutton", { name: "Selected channel", exact: true })
      .fill("12");
    await expect(page.getByText("CH 12", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("instrument-rf.png") });
    await page.keyboard.press("F6");
    await expect(
      page.getByRole("table", { name: "Reconstruction measurements" }),
    ).toBeVisible({ timeout: 90000 });
    await expect(
      page.getByRole("img", { name: /Passive DAS ·/ }),
    ).toBeVisible();
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    const record = (await page.evaluate(
      (id) => window.pam.request("run", id),
      runs.find((r) => r.status === "complete")!.id,
    )) as Run;
    expect(Object.keys(record.metrics!.methods).sort()).toEqual([
      "atp",
      "cf",
      "das",
      "rcb",
      "tea",
    ]);
    for (const metric of Object.values(record.metrics!.methods))
      expect(metric!.localization_error_m).toBeLessThan(0.002);
    expect(
      record.metrics!.diagnostics!.rcb_constraint_residual_max,
    ).toBeLessThanOrEqual(0.100000001);
    await page.screenshot({ path: testInfo.outputPath("instrument-das.png") });
    const frozen = JSON.stringify(record);
    await page
      .getByRole("tablist", { name: "Reconstruction method" })
      .getByRole("tab", { name: "RCB", exact: true })
      .click();
    await expect(page.getByRole("img", { name: /RCB ·/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("instrument-rcb.png") });
    await page
      .getByLabel("Map display", { exact: true })
      .selectOption("linear");
    await page.getByLabel("Dynamic range", { exact: true }).selectOption("-60");
    await page.getByLabel("Colour map", { exact: true }).selectOption("gray");
    expect(
      JSON.stringify(
        await page.evaluate((id) => window.pam.request("run", id), record.id),
      ),
    ).toBe(frozen);
    const resize = page.getByRole("separator", {
      name: "Resize Properties panel",
    });
    const oldWidth = Number(await resize.getAttribute("aria-valuenow"));
    await resize.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(resize).toHaveAttribute(
      "aria-valuenow",
      String(oldWidth + 10),
    );
    await menu(page, "View", "Dark theme");
    await page.screenshot({ path: testInfo.outputPath("instrument-dark.png") });
    await menu(page, "View", "Dark theme");
    await page
      .getByLabel("Colour map", { exact: true })
      .selectOption("viridis");
    await page.getByLabel("Map display", { exact: true }).selectOption("db");
    await page
      .getByRole("button", { name: "Tile results", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("instrument-tiled.png"),
    });
    const archive = path.join(folder, "experiment.zip");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, archive);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const exportDialog = page.getByRole("dialog", {
      name: "Export experiment",
      exact: true,
    });
    await exportDialog.getByLabel("Include raw RF data").check();
    await exportDialog.getByRole("button", { name: "Export ZIP…" }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(archive)).byteLength;
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
    }, archive);
    await menu(page, "File", "Import experiment…");
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
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, project);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("tab", { name: /^Runs/ }).click();
    await expect(
      page.getByRole("table", { name: "Run history", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { require: unknown }).require,
      ),
    ).toBe("undefined");
    await expect(
      page.evaluate(() => window.pam.request("../../outside" as never)),
    ).rejects.toThrow();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    ).toBe(true);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("invalid model and cancelled computation publish no completed result", async ({}, testInfo) => {
  const { app, page } = await launch();
  try {
    await app.evaluate(({ session }) =>
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      ),
    );
    await create(page);
    await page
      .getByRole("spinbutton", { name: "Source 1 z (mm)", exact: true })
      .fill("30000");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => window.pam.request("runs"))).toEqual([]);
    await page.getByRole("button", { name: "Preset", exact: true }).click();
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("192");
    await page
      .getByRole("spinbutton", { name: "Gate stride (samples)", exact: true })
      .fill("1");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Stop calculation", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            (await page.evaluate(() => window.pam.request("job"))) as {
              status: string;
            }
          ).status,
      )
      .toBe("interrupted");
    const runs = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    expect(runs.filter((r) => r.status === "complete")).toHaveLength(0);
    expect(runs.filter((r) => r.status === "interrupted")).toHaveLength(1);
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});

test("analysis edits reuse RF and compact workspace remains usable", async ({}, testInfo) => {
  const { app, page } = await launch();
  try {
    await create(page);
    await page.getByRole("tab", { name: "Analysis", exact: true }).click();
    await page.getByRole("button", { name: "DAS only", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("33");
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await expect(page.getByRole("img", { name: /RF overview;/ })).toBeVisible();
    const before = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    await page
      .getByRole("spinbutton", { name: "Grid size per axis", exact: true })
      .fill("65");
    await page
      .getByRole("button", { name: "Reconstruct", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Passive DAS ·/ }),
    ).toBeVisible();
    const after = (await page.evaluate(() =>
      window.pam.request("runs"),
    )) as RunSummary[];
    expect(before.filter((r) => r.status === "simulated")).toHaveLength(1);
    expect(after.filter((r) => r.status === "simulated")).toHaveLength(1);
    const record = (await page.evaluate(
      (id) => window.pam.request("run", id),
      after.find((r) => r.status === "complete")!.id,
    )) as Run;
    expect(record.config.grid_n).toBe(65);
    expect(Object.keys(record.metrics!.methods)).toEqual(["das"]);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 800),
    );
    await expect
      .poll(() => page.evaluate(() => window.innerWidth))
      .toBeLessThan(1200);
    await page.getByRole("button", { name: /Zoom in Passive DAS/ }).click();
    await page.getByRole("button", { name: /Fit Passive DAS/ }).click();
    await page.screenshot({
      path: testInfo.outputPath("instrument-compact.png"),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Toggle Properties panel", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Properties panel" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Toggle Properties panel", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Properties panel" }),
    ).toBeVisible();
  } finally {
    await snapshotOnFailure(app, page, testInfo);
  }
});
