import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { jsPDF } from "jspdf";

const stageLabels = [
  "Swallow", "Absorption", "Portal circulation", "Right heart", "Lungs",
  "Left heart", "Brain", "Liver clearance", "Kidneys",
];

const guided = (page: Page) => page.getByRole("region", { name: "Guided simulation" });
const jump = (page: Page) => guided(page).getByRole("combobox", { name: "Jump to stage" });
const slider = (page: Page) => guided(page).getByRole("slider", { name: "Simulated time, in hours" });
const ready = (page: Page, scene: "guided" | "lab") =>
  page.locator(`[data-anatomy-status="ready"] canvas[data-anatomy-scene="${scene}"]`);

async function study(page: Page, medicine: "Levetiracetam" | "Linezolid" = "Levetiracetam") {
  await page.goto("/simulator");
  await page.getByRole("button", { name: new RegExp(`^Play study ${medicine}`) }).click();
  await expect(guided(page)).toBeVisible();
}

async function checkCanvasSize(page: Page) {
  const canvas = ready(page, "guided");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const display = element.getBoundingClientRect();
    const container = element.parentElement?.getBoundingClientRect();
    const aspect = Number(element.dataset.anatomyAspect);
    return {
      fills: Boolean(container && Math.abs(display.width - container.width) < 2 &&
        Math.abs(display.height - container.height) < 2),
      aspect: Math.abs(display.width / display.height - aspect) < 0.02,
      dpr: element.width / display.width <= 2.01,
      nonzero: element.width > 0 && element.height > 0,
    };
  })).toEqual({ fills: true, aspect: true, dpr: true, nonzero: true });
}

test("study, exact-hour scrub, shared results and downloadable evidence", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await study(page);
  await expect(ready(page, "guided")).toBeVisible();
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await slider(page).press("Home");
  for (let step = 0; step < 6; step++) await slider(page).press("PageUp");
  await expect(slider(page)).toHaveAttribute("aria-valuenow", "12");

  const ka = 0.616;
  const ke = 3.26 / 34.7;
  const expected = 500 * ka / (34.7 * (ka - ke)) * (Math.exp(-ke * 12) - Math.exp(-ka * 12));
  const outputs = page.getByRole("complementary", { name: "Model outputs" });
  await expect(outputs).toContainText(expected.toFixed(3));
  await expect(outputs.locator("[data-curve-time]")).toHaveText(/t\s*=\s*12\.00 h/);
  await expect(guided(page).locator("[data-live-values]")).toContainText(expected.toFixed(3));
  await expect(guided(page).locator("[data-live-values]")).toContainText("At the current simulation time");
  console.log(`Scrub t=12 h: expected ${expected.toFixed(6)} mg/L, displayed ${expected.toFixed(3)} mg/L`);

  await guided(page).getByRole("link", { name: "Results", exact: true }).click();
  const results = page.locator("#simulation-results");
  await expect(results).toBeVisible();
  await expect(results.locator('[aria-label="Shared by Heart, Lungs, Brain"]')).toBeVisible();
  for (const metric of ["Cmax", "Tmax", "AUC", "half-life"]) {
    await expect(results).toContainText(new RegExp(metric, "i"));
  }
  await results.getByText("How this is computed", { exact: true }).click();
  await expect(results).toContainText("mg·h/L");

  const pdfReady = page.waitForEvent("download");
  await results.getByRole("link", { name: "Download PDF" }).click();
  const pdf = await pdfReady;
  const pdfPath = info.outputPath("study-report.pdf");
  await pdf.saveAs(pdfPath);
  expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe("%PDF-");

  const csvReady = page.waitForEvent("download");
  await results.getByRole("link", { name: "Download CSV" }).click();
  const csv = await csvReady;
  const csvPath = info.outputPath("study-series.csv");
  await csv.saveAs(csvPath);
  const rows = (await readFile(csvPath, "utf8")).trim().split(/\r?\n/);
  expect(rows.length).toBeGreaterThan(100);
  expect(rows[0]).toMatch(/(?:hour|time|\bh\b)/i);
  expect(rows.join("\n")).toContain("Levetiracetam");
  expect(errors).toEqual([]);
  console.log(`Export: ${pdfPath} and ${csvPath} (${rows.length - 1} rows)`);

  await study(page, "Linezolid");
  await expect(guided(page)).toContainText("Linezolid");
});

for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768], [390, 844]]) {
  test(`stage framing at ${width}x${height}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await study(page);
    await checkCanvasSize(page);
    const stages = jump(page);
    const canvas = ready(page, "guided");
    let previousHour = -1;
    for (const [index, label] of stageLabels.entries()) {
      await stages.selectOption({ label });
      const selectedHour = Number(await slider(page).getAttribute("aria-valuenow"));
      expect(selectedHour).toBeGreaterThan(previousHour);
      previousHour = selectedHour;
      await expect(guided(page).getByRole("heading", { name: label, exact: true })).toBeVisible();
      await canvas.scrollIntoViewIfNeeded();
      await checkCanvasSize(page);
      const frames = Number(await canvas.getAttribute("data-anatomy-frames"));
      await expect.poll(async () => Number(await canvas.getAttribute("data-anatomy-frames"))).toBeGreaterThan(frames);
      const name = `${String(index + 1).padStart(2, "0")}-${label.toLowerCase().replaceAll(" ", "-")}.png`;
      const destination = info.outputPath(name);
      await page.screenshot({ path: destination, animations: "disabled" });
      console.log(`${width}x${height} ${label} t=${selectedHour} h`);
    }
    await stages.selectOption({ label: "Complete" });
    await expect(slider(page)).toHaveAttribute("aria-valuenow", "48");

    if (width === 1440) {
      await page.setViewportSize({ width: 1024, height: 768 });
      await checkCanvasSize(page);
      await canvas.evaluate(async (element) => {
        const container = element.parentElement;
        if (!container) throw new Error("Missing anatomy container");
        await container.requestFullscreen();
      });
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      await checkCanvasSize(page);
      await page.evaluate(() => document.exitFullscreen());
      await checkCanvasSize(page);
      console.log("Canvas fits after resize, fullscreen and exit");
    }
  });
}

test("signed-out custom validation, offline selection, restored setup and run", async ({ page }) => {
  await page.goto("/simulator");
  await page.getByRole("button", { name: "Custom setup" }).click();
  const run = page.getByRole("button", { name: "Run and play" });
  await expect(run).toHaveAttribute("aria-disabled", "true");
  for (const name of ["Medicines", "Person", "Window and run"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Load synthetic example" }).click();
  await expect(page.getByText("Synthetic example", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Synthetic example drug" }).click();
  await expect(page.getByText("0 of 5 medicines")).toBeVisible();
  const age = page.getByLabel("Age (years)", { exact: true });
  await expect(page.getByText("Enter a whole age from 1 to 120 years.")).toHaveCount(0);
  await age.fill("0");
  await age.blur();
  await expect(page.getByText("Enter a whole age from 1 to 120 years.")).toBeVisible();
  await age.fill("33");
  const search = page.getByRole("combobox", { name: "Search medicine catalogue" });
  await search.fill("ibu");
  const options = page.getByRole("listbox", { name: "Medicine search results" });
  await expect(options.getByRole("option", { name: /Ibuprofen.*Studied range 292–300 mg/i })).toBeVisible();
  await search.press("Escape");
  await expect(options).toBeHidden();
  await expect(search).toHaveValue("ibu");
  await search.press("ArrowDown");
  await expect(options).toBeVisible();
  await search.press("Enter");
  await expect(page.getByText(/Offline catalogue · 5 medicines/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Ibuprofen" })).toBeVisible();
  const dose = page.getByLabel("Ibuprofen dose 1 amount in milligrams");
  await dose.fill("200");
  await dose.blur();
  await expect(page.getByRole("status", { name: "Setup summary" })).toContainText("Ibuprofen · 200 mg at 0 h");
  await page.reload();
  if (!await age.isVisible()) await page.getByRole("button", { name: "Custom setup" }).click();
  await expect(age).toHaveValue("33");
  await expect(dose).toHaveValue("200");
  await run.click();
  await expect(guided(page)).toContainText("Ibuprofen");
});

test("Organ Lab is idle until a starter runs; PDF parsing needs review", async ({ page }) => {
  await page.goto("/simulator/organ-lab");
  const anatomy = page.getByRole("region", { name: "The anatomy" });
  const labSlider = anatomy.getByRole("slider", { name: "Simulation time" });
  await expect(labSlider).toHaveAttribute("aria-valuenow", "0");
  await expect(labSlider).toHaveAttribute("aria-disabled", "true");
  const stopped = anatomy.getByRole("group", { name: "Playback unavailable" });
  await stopped.focus();
  await expect(stopped.getByRole("tooltip")).toHaveText("Add a medicine to see levels");
  await expect(anatomy.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Try linezolid" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Try levetiracetam" }).first().click();
  await expect(labSlider).toHaveAttribute("aria-disabled", "false");
  await expect(ready(page, "lab")).toBeVisible();
  const camera = anatomy.getByRole("combobox", { name: "Anatomy view" });
  await camera.focus();
  await expect(camera).toBeFocused();
  await labSlider.press("PageUp");
  const hourBeforeCameraPick = await labSlider.getAttribute("aria-valuenow");
  await camera.selectOption("kidneys");
  await expect(labSlider).toHaveAttribute("aria-valuenow", hourBeforeCameraPick ?? "");

  const pdf = new jsPDF();
  pdf.text("Weight 73 kg", 20, 20);
  const weight = page.getByRole("spinbutton", { name: "Weight (kg)", exact: true });
  const previousWeight = await weight.inputValue();
  await Promise.all([
    page.waitForEvent("worker", {
      predicate: (worker) => new URL(worker.url()).pathname.endsWith("/pdf.worker.min.mjs"),
      timeout: 15_000,
    }),
    page.getByLabel("Upload a medical PDF").setInputFiles({
      name: "synthetic-report.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf.output("arraybuffer")),
    }),
  ]);
  const apply = page.getByRole("button", { name: "Apply reviewed values" });
  await expect(apply).toBeVisible();
  const preview = page.getByRole("table", { name: "Review extracted values" });
  await expect(preview.getByRole("columnheader", { name: "Confidence" })).toBeVisible();
  await expect(preview).toContainText("Weight 73 kg");
  await expect(weight).toHaveValue(previousWeight);
  await apply.click();
  await expect(weight).toHaveValue("73");
});

test("WebGL unavailable keeps the guided time and outputs usable", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type.startsWith("webgl") || type === "experimental-webgl"
          ? null : Reflect.apply(getContext, this, [type, ...args]);
      },
    });
  });
  await study(page);
  await expect(page.getByRole("img", { name: "Static full-body anatomical illustration" })).toBeVisible();
  await expect(page.getByText(/3D anatomy unavailable/)).toBeVisible();
  await jump(page).selectOption({ label: "Kidneys" });
  await expect(page.getByRole("complementary", { name: "Model outputs" })).toContainText("mg/L");
});

type Memory = { geometries: number; textures: number; programs: number };
type Disposal = { scene: "guided" | "lab"; before: Memory; after: Memory; frames: number };

test("offscreen frames stop and renderer resources return to zero across ten navigations", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const samples: Disposal[] = [];
    Object.defineProperty(window, "anatomyDisposals", { value: samples });
    document.addEventListener("anatomy:renderer-disposed", (event) => {
      if (event instanceof CustomEvent) samples.push(event.detail);
    });
  });
  await study(page);
  await slider(page).press("Home");
  await expect(slider(page)).toHaveAttribute("aria-valuenow", "0");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const zero = { geometries: 0, textures: 0, programs: 0 };
  const baseline: Partial<Record<"guided" | "lab", Memory>> = {};
  for (let index = 0; index < 10; index++) {
    const scene = index % 2 === 0 ? "guided" : "lab";
    const canvas = ready(page, scene);
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(async () => Number(await canvas.getAttribute("data-anatomy-frames"))).toBeGreaterThan(2);
    if (index === 0) {
      await page.locator("#simulation-results").scrollIntoViewIfNeeded();
      await expect(canvas).toHaveAttribute("data-anatomy-paused", "true");
      const frames = await canvas.getAttribute("data-anatomy-frames");
      await page.evaluate(() => new Promise<void>((resolve) => {
        let remaining = 10;
        const next = () => --remaining === 0 ? resolve() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      }));
      await expect(canvas).toHaveAttribute("data-anatomy-frames", frames ?? "");
    }
    await nav.getByRole("link", { name: scene === "guided" ? "Organ Lab" : "Simulator", exact: true }).click();
    const disposals = () => page.evaluate(() =>
      Reflect.get(window, "anatomyDisposals") as Disposal[]);
    await expect.poll(async () => (await disposals()).length).toBe(index + 1);
    const sample = (await disposals())[index];
    expect(sample.scene).toBe(scene);
    expect(sample.before.geometries).toBeGreaterThan(0);
    expect(sample.after).toEqual(zero);
    if (baseline[scene]) expect(sample.before).toEqual(baseline[scene]);
    else baseline[scene] = sample.before;
    console.log(`Navigation ${index + 1} ${scene}: ${JSON.stringify(sample.before)} -> ${JSON.stringify(sample.after)}`);
    if (scene === "lab") {
      await expect(guided(page)).toBeVisible();
      await expect(slider(page)).toHaveAttribute("aria-valuenow", "0");
    }
  }
});

test("WebGL context loss falls back and retry restores the model", async ({ page }) => {
  await study(page);
  const canvas = ready(page, "guided");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const ext = element.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context is unavailable");
    ext.loseContext();
  });
  await expect(page.getByRole("img", { name: "Static full-body anatomical illustration" })).toBeVisible();
  await expect(slider(page)).toBeEnabled();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(canvas).toBeVisible();
});

test("PubMed error offers retry and successful queries are cached", async ({ page }) => {
  let fail = true;
  let requests = 0;
  await page.route("https://eutils.ncbi.nlm.nih.gov/**", async (route) => {
    requests++;
    if (fail) {
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
      return;
    }
    const body = route.request().url().includes("esearch.fcgi")
      ? { esearchresult: { idlist: ["32208795"] } }
      : { result: { uids: ["32208795"], "32208795": {
        title: "Population pharmacokinetics of levetiracetam", pubdate: "2020", source: "Seizure",
      } } };
    await route.fulfill({ json: body });
  });
  await study(page);
  const disclosure = page.getByText(/Related literature for/, { exact: false });
  await disclosure.click();
  const panel = page.getByRole("complementary", { name: "Published research about this process" });
  await panel.scrollIntoViewIfNeeded();
  const retry = panel.getByRole("button", { name: "Retry lookup" });
  await expect(retry).toHaveCount(2);
  fail = false;
  await retry.first().click();
  await retry.first().click();
  const paper = panel.getByRole("link", { name: "Population pharmacokinetics of levetiracetam" }).first();
  await expect(paper).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/32208795/");
  await expect(panel.getByText("Looking up published papers…")).toHaveCount(0);
  const countBefore = requests;
  await disclosure.click();
  await disclosure.click();
  await expect(paper).toBeVisible();
  expect(requests).toBe(countBefore);
});
