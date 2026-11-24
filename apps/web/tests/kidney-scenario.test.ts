import { describe, expect, it } from "vitest";
import type { SimResult } from "@dib/engine";
import {
  CLEARANCE_SCENARIOS,
  compareRuns,
  SCENARIO_CONTEXT,
  scenarioById,
} from "../lib/kidney-scenario";
import {
  KIDNEY_CONTEXT_LABEL,
  KIDNEY_PAPERS,
  kidneyPaperUrl,
} from "../lib/kidney-evidence";

const engineResult = (overrides: Partial<SimResult> = {}): SimResult => ({
  tH: [],
  gutMg: [],
  bodyMg: [],
  concMgPerL: [],
  eliminationMgPerH: [],
  cmaxMgPerL: 2,
  tmaxH: 1,
  timeToClearH: 10,
  warnings: [],
  ...overrides,
});

describe("clearance scenarios", () => {
  it("offers an unscaled scenario and two synthetic reductions", () => {
    expect(CLEARANCE_SCENARIOS.map((s) => s.id)).toEqual([
      "baseline",
      "reduced",
      "further-reduced",
    ]);
    expect(CLEARANCE_SCENARIOS.map((s) => s.multiplier)).toEqual([1, 0.5, 0.25]);
  });

  it("falls back to the baseline for an unknown id", () => {
    expect(scenarioById("nope").id).toBe("baseline");
  });

  it("labels the setting as a model what-if, not a measurement", () => {
    expect(SCENARIO_CONTEXT).toMatch(/not a measurement of kidney function or dosing advice/i);
  });
});

describe("compareRuns", () => {
  it("builds every row from the two engine results", () => {
    const rows = compareRuns(
      engineResult({ cmaxMgPerL: 3, tmaxH: 2, timeToClearH: null }),
      engineResult({ cmaxMgPerL: 2, tmaxH: 1, timeToClearH: 10 })
    );
    expect(rows).toEqual([
      { label: "Peak level (Cmax)", baseline: "2.000 mg/L", scenario: "3.000 mg/L" },
      { label: "Time of peak (Tmax)", baseline: "1.00 h", scenario: "2.00 h" },
      {
        label: "Time below 5% of peak",
        baseline: "10.00 h",
        scenario: "Not within window",
      },
    ]);
  });
});

describe("kidney evidence", () => {
  it("holds hand-checked PubMed ids with a context label", () => {
    expect(KIDNEY_PAPERS.length).toBeGreaterThanOrEqual(3);
    for (const paper of KIDNEY_PAPERS) {
      expect(paper.pmid).toMatch(/^\d+$/);
      expect(paper.title.length).toBeGreaterThan(10);
      expect(paper.context.length).toBeGreaterThan(10);
    }
    expect(KIDNEY_CONTEXT_LABEL).toMatch(/not the model's output/i);
  });

  it("links to PubMed by stored id", () => {
    expect(kidneyPaperUrl("14606929")).toBe(
      "https://pubmed.ncbi.nlm.nih.gov/14606929/"
    );
  });
});
