import { buildReport, type simulate } from "@dib/engine";
import type { MedicationRun } from "@/lib/treatment";
import type { StudyCase } from "@/lib/study-cases";
import type { SimulatorInput } from "./console";
import { formatHours, readMoment, type PlaybackStage } from "./playback";
import { EXAMPLE_BANNER } from "@/lib/example-drug";

export type GuidedRun = Omit<MedicationRun, "result"> & { result: ReturnType<typeof simulate> };

export type ReportData = {
  runs: GuidedRun[];
  primaryRun: GuidedRun;
  active: SimulatorInput;
  stages: PlaybackStage[];
  study?: StudyCase;
  isExample: boolean;
  treatmentLabel: string;
};

export const RESULT_FORMULAS = [
  "Cmax (mg/L) = the highest sampled central concentration. Tmax (h) = the time of the first sample at that peak.",
  "AUC(0–t) (mg·h/L) is the area from zero to the end of the run. For each pair of samples, add (C1 + C2) / 2 × (t2 - t1).",
  "Elimination half-life (h) = ln(2) / ke, where ke = CL / V (1/h). A zero clearance gives no finite half-life.",
  "For a single dose, C(t) = F × D × ka / [V × (ka - ke)] × [exp(-ke × t) - exp(-ka × t)]. When ka = ke, C(t) = (F × D / V) × ka × t × exp(-ka × t).",
  "F is the fraction reaching circulation, D is the dose (mg), ka is the absorption rate (1/h), and V is the volume (L). Time t starts at gut entry. Add each dose's time-shifted contribution for repeated doses.",
];

export function reportMetrics(result: GuidedRun["result"]) {
  const area = result.tH.reduce((sum, time, index) =>
    index > 0 ? sum + (result.concMgPerL[index - 1] + result.concMgPerL[index]) / 2 * (time - result.tH[index - 1]) : sum, 0);
  return [
    { label: "Peak concentration (Cmax)", value: `${result.cmaxMgPerL.toFixed(3)} mg/L` },
    { label: "Time of peak (Tmax)", value: result.cmaxMgPerL > 0 ? `${formatHours(result.tmaxH)} h` : "No exposure" },
    { label: `AUC(0–${result.tH.at(-1)} h)`, value: `${area.toFixed(2)} mg·h/L` },
    { label: "Elimination half-life", value: result.eliminationHalfLifeH == null ? "No finite half-life" : `${result.eliminationHalfLifeH.toFixed(2)} h` },
  ];
}

export const CHECKPOINT_COLUMNS = ["Stage", "Time (h)", "Conc. (mg/L)", "Gut (mg)", "Central (mg)", "Elim. (mg/h)"];
export function checkpointRows({ primaryRun, stages }: Pick<ReportData, "primaryRun" | "stages">) {
  return stages.map((stage) => {
    const { hours, concMgPerL, gutMg, bodyMg, eliminationMgPerH } = readMoment(primaryRun.result, stage.hours);
    return [stage.label, formatHours(hours), concMgPerL.toFixed(3), gutMg.toFixed(1), bodyMg.toFixed(1), eliminationMgPerH.toFixed(2)];
  });
}

export function reportDisclaimers({ isExample, primaryRun }: Pick<ReportData, "isExample" | "primaryRun">) {
  return [...(isExample ? [EXAMPLE_BANNER] : []), buildReport(primaryRun.result).disclaimer];
}

export const SERIES_LABELS = {
  concMgPerL: "Central concentration · mg/L",
  gutMg: "Amount in the gut · mg",
  eliminationMgPerH: "Total model elimination · mg/h",
};

export const ELIMINATION_NOTE = "The liver and kidneys share the total elimination rate in this model.";
export type Series = keyof typeof SERIES_LABELS;

export function chartData(runs: MedicationRun[], metric: Series) {
  const duration = runs[0]?.result.tH.at(-1) || 1;
  const max = runs.reduce((peak, { result }) => result[metric].reduce((value, sample) => Math.max(value, sample), peak), 0) || 1;
  return {
    duration,
    max,
    series: runs.map(({ id, name, color, result }) => ({
      id, name, color,
      points: result.tH.map((time, i) => [time / duration, 1 - result[metric][i] / max] as const),
    })),
  };
}

export function parameterRows({ active, study }: Pick<ReportData, "active" | "study">) {
  const format = (value: number | null, unit = "") => value == null ? "Unavailable" : `${Number(value.toPrecision(6))}${unit}`;
  return active.drugs.map(({ drug, doses, citations }) => ({
    id: drug.id,
    citations,
    name: drug.name,
    doses: [...doses].sort((a, b) => a.timeH - b.timeH).map(({ doseMg, timeH }) => `${doseMg} mg at ${timeH} h`),
    parameters: [
      { label: "Absorption rate (ka)", value: format(drug.ka_per_h, " /h") },
      { label: "Oral bioavailability (F)", value: format(drug.F == null ? null : 100 * drug.F, "%") },
      { label: "Volume (V)", value: format(drug.V_L_per_kg == null ? null : drug.V_L_per_kg * active.weightKg, " L") },
      { label: "Clearance (CL)", value: format(drug.CL_L_per_h_per_kg == null ? null : drug.CL_L_per_h_per_kg * active.weightKg, " L/h") },
      ...(drug.tlag_h ? [{ label: "Absorption lag", value: format(drug.tlag_h, " h") }] : []),
    ],
    notes: drug.notes,
    references: study?.references ?? drug.sources
      .filter((url) => /^https?:\/\//i.test(url))
      .map((url, index) => ({ label: `Source ${index + 1}`, url })),
  }));
}
