import type { simulate, SimResult } from "@dib/engine";
import type { FocusOrgan } from "./scene";

export const ROUTE_COPY = {
  swallow: "The oral dose travels down the esophagus into the stomach.",
  absorption: "The dose reaches the small intestine, where dissolved drug can enter the blood.",
  portal: "The hepatic portal vein carries absorbed drug from the intestine to the liver for a first pass.",
  "right-heart": "Blood leaving the liver returns through the vena cava to the right side of the heart.",
  lungs: "The right heart pumps blood through the pulmonary arteries into both lungs.",
  "left-heart": "The pulmonary veins return blood from the lungs to the left side of the heart.",
  brain: "The left heart pumps blood out through the aorta. One branch supplies the brain.",
  body: "The left heart pumps blood through the aorta and its branches to tissues around the body.",
  liver: "Blood also supplies the liver through the hepatic artery. The liver metabolizes some medicines.",
  kidneys: "Renal arteries carry blood to the kidneys. Some drugs and metabolites leave the body in urine.",
} as const;

export type DoseRoute = keyof typeof ROUTE_COPY;
export type PlaybackStage = { label: string; organ: FocusOrgan | null; hours: number; startsAtH: number; route?: DoseRoute };
export type JourneyPosition = { hours: number; swallowElapsedMs: number };

export const TRAVEL_MS = 3200;
export const HOLD_MS = 4000;

export function buildStages(
  result: Pick<SimResult, "tH" | "concMgPerL"> & Partial<Pick<SimResult, "timeToClearH">>,
  doseHours: number[],
  lagH = 0,
): PlaybackStage[] {
  const end = result.tH.at(-1) ?? 0;
  if (end <= 0) return [];
  const [first = 0, nextDose = Infinity] = [...new Set(doseHours.filter((time) => time >= 0 && time <= end))]
    .sort((a, b) => a - b);
  let firstPeak = first;
  let peak = 0;
  for (let i = 0; i < result.tH.length; i += 1) {
    const time = result.tH[i];
    if (time < first || time >= nextDose) continue;
    if (result.concMgPerL[i] > peak) {
      peak = result.concMgPerL[i];
      firstPeak = time;
    }
  }

  // Leave room for the nine illustrative stops even if the dose or peak is at the window boundary.
  const swallow = first < end ? first : 0;
  const brain = firstPeak > swallow && firstPeak < end ? firstPeak : swallow + (end - swallow) / 2;
  const gutEntry = first + lagH;
  const risingStart = gutEntry >= swallow && gutEntry < brain ? gutEntry : swallow;
  const atRise = (fraction: number) => risingStart + (brain - risingStart) * fraction;
  const tail = result.timeToClearH != null && result.timeToClearH > brain ? result.timeToClearH : end;
  const stages: Omit<PlaybackStage, "startsAtH">[] = [
    { label: "Swallow", organ: null, route: "swallow", hours: swallow },
    { label: "Absorption", organ: "gut", route: "absorption", hours: atRise(0.10) },
    { label: "Portal circulation", organ: "liver", route: "portal", hours: atRise(0.22) },
    { label: "Right heart", organ: "heart", route: "right-heart", hours: atRise(0.38) },
    { label: "Lungs", organ: "lungs", route: "lungs", hours: atRise(0.52) },
    { label: "Left heart", organ: "heart", route: "left-heart", hours: atRise(0.68) },
    { label: "Brain", organ: "brain", route: "brain", hours: brain },
    { label: "Liver clearance", organ: "liver", route: "liver", hours: brain + (tail - brain) * 0.16 },
    { label: "Kidneys", organ: "kidneys", route: "kidneys", hours: brain + (tail - brain) * 0.70 },
    { label: "Complete", organ: null, hours: end },
  ];
  return stages.map((stage, index) => ({
    ...stage,
    startsAtH: index === 0 ? 0 : stage.route ? (stages[index - 1].hours + stage.hours) / 2 : stage.hours,
  }));
}

export function playbackAt(stages: PlaybackStage[], hours: number, swallowElapsedMs = TRAVEL_MS) {
  const index = Math.max(0, stages.findLastIndex(({ startsAtH }) => startsAtH <= hours));
  const stage = stages[index];
  const opening = hours === 0 && stage?.route === "swallow" && stage.hours === 0;
  const travel = opening ? swallowElapsedMs / TRAVEL_MS :
    stage && hours < stage.hours ? (hours - stage.startsAtH) / (stage.hours - stage.startsAtH) : 1;
  if (travel >= 1) return { index, fraction: 1, holding: true };
  return { index, fraction: travel * travel * (3 - 2 * travel), holding: false };
}

export function advancePlayback(stages: PlaybackStage[], hours: number, elapsedMs: number): number {
  const { index, holding } = playbackAt(stages, hours);
  const stage = stages[index];
  if (!stage) return hours;
  const next = stages[index + 1];
  const start = holding ? stage.hours : stage.startsAtH;
  const end = holding ? next?.startsAtH ?? stage.hours : stage.hours;
  const duration = holding ? HOLD_MS : TRAVEL_MS;
  return Math.min(end, hours + (end - start) * (elapsedMs / duration));
}

export function advanceJourney(stages: PlaybackStage[], position: JourneyPosition, elapsedMs: number): JourneyPosition {
  const { hours, swallowElapsedMs } = position;
  // A dose at hour zero has no interval on the model clock for the swallow animation.
  if (hours === 0 && stages[0]?.route === "swallow" && stages[0].hours === 0 && swallowElapsedMs < TRAVEL_MS) {
    const travelMs = Math.min(elapsedMs, TRAVEL_MS - swallowElapsedMs);
    return {
      hours: advancePlayback(stages, hours, elapsedMs - travelMs),
      swallowElapsedMs: swallowElapsedMs + travelMs,
    };
  }
  return { ...position, hours: advancePlayback(stages, hours, elapsedMs) };
}

export function readMoment(result: ReturnType<typeof simulate>, hours: number) {
  return result.at(hours);
}

export function formatHours(hours: number) {
  return hours.toFixed(4).replace(/(\.\d{2,}?)0+$/, "$1");
}

export function timeLabel(hours: number) {
  const formatted = formatHours(hours);
  const sign = Math.abs(hours - Number(formatted)) < 1e-10 ? "=" : "≈";
  return `at t ${sign} ${formatted} h`;
}
