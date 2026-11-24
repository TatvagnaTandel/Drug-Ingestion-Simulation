/**
 * The kidney what-if: an illustrative multiplier on the model's total
 * clearance. The comparison keeps the same drug inputs and organ profiles.
 * The extra multiplier applies only to the what-if run.
 */

import type { SimResult } from "@dib/engine";

export const CLEARANCE_SCENARIO_IDS = ["baseline", "reduced", "further-reduced"] as const;
export type ClearanceScenarioId = (typeof CLEARANCE_SCENARIO_IDS)[number];

export type ClearanceScenario = {
  id: ClearanceScenarioId;
  label: string;
  multiplier: number;
  note: string;
};

export const CLEARANCE_SCENARIOS: readonly ClearanceScenario[] = [
  {
    id: "baseline",
    label: "No extra clearance scaling — 100%",
    multiplier: 1,
    note: "Uses the clearance from the selected organ profiles and cited drug parameters.",
  },
  {
    id: "reduced",
    label: "Illustrative lower clearance — 50%",
    multiplier: 0.5,
    note: "A what-if on the model's total clearance, not a measurement of any person.",
  },
  {
    id: "further-reduced",
    label: "Illustrative lower clearance — 25%",
    multiplier: 0.25,
    note: "A stronger what-if on the model's total clearance, not a measurement of any person.",
  },
];

/** The named setting, with a safe fallback for an unknown id. */
export function scenarioById(id: ClearanceScenarioId | string): ClearanceScenario {
  return CLEARANCE_SCENARIOS.find((s) => s.id === id) ?? CLEARANCE_SCENARIOS[0];
}

/** Shown wherever the setting appears, in the panel and in saved summaries. */
export const SCENARIO_CONTEXT =
  "Illustrative model setting. This is not a measurement of kidney function or dosing advice.";

export type ComparisonRow = { label: string; baseline: string; scenario: string };

const hours = (v: number) => `${v.toFixed(2)} h`;
const concentration = (v: number) => `${v.toFixed(3)} mg/L`;
const clearTime = (v: number | null) => (v == null ? "Not within window" : hours(v));

/**
 * A side-by-side built only from two engine results. No literature value and
 * no invented number is mixed into these rows.
 */
export function compareRuns(scenario: SimResult, baseline: SimResult): ComparisonRow[] {
  return [
    {
      label: "Peak level (Cmax)",
      baseline: concentration(baseline.cmaxMgPerL),
      scenario: concentration(scenario.cmaxMgPerL),
    },
    {
      label: "Time of peak (Tmax)",
      baseline: hours(baseline.tmaxH),
      scenario: hours(scenario.tmaxH),
    },
    {
      label: "Time below 5% of peak",
      baseline: clearTime(baseline.timeToClearH),
      scenario: clearTime(scenario.timeToClearH),
    },
  ];
}
