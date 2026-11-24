"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { MAX_DOSES_PER_DRUG, MAX_REPORT_DRUGS } from "@dib/data-client";
import { HEART_PROFILES, KIDNEY_PROFILES, LIVER_PROFILES, LUNG_PROFILES } from "@dib/engine";
import { CONDITIONS as GUIDED_CONDITIONS } from "../components/simulator/condition";
import { CONDITIONS as LAB_CONDITIONS } from "../components/organ-lab/condition";
import type { SimulatorInput as GuidedInput } from "../components/simulator/console";
import type { SimulatorInput as LabInput } from "../components/organ-lab/console";
import { resolveCatalogueDrug, type ResolvedDrug } from "./catalogue";
import { CLEARANCE_SCENARIO_IDS } from "./kidney-scenario";
import { STUDY_CASES } from "./study-cases";
import { exampleDrug } from "./example-drug";
import { ageError, doseError, doseTimeError, weightError, windowError } from "./setup-validation";

type Mode = "guided" | "lab";

const profileId = <Id extends string>(profiles: readonly { profile_id: Id }[]) =>
  z.string().refine((id): id is Id => profiles.some((profile) => profile.profile_id === id)).optional();

const setup = z.object({
  conditionId: z.string().max(48),
  ageYears: z.number().refine((n) => !ageError(n)),
  weightKg: z.number().refine((n) => !weightError(n)),
  sex: z.enum(["", "female", "male", "other"]),
  tEndH: z.number().refine((n) => !windowError(n)),
  importedPdf: z.boolean().optional(),
  clearanceScenario: z.enum(CLEARANCE_SCENARIO_IDS).optional(),
  organProfiles: z.object({
    heartId: profileId(HEART_PROFILES),
    kidneyId: profileId(KIDNEY_PROFILES),
    liverId: profileId(LIVER_PROFILES),
    lungId: profileId(LUNG_PROFILES),
  }).optional(),
  drugs: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i),
    name: z.string().trim().min(1).max(160),
    offline: z.boolean().optional(),
    doses: z.array(z.object({
      doseMg: z.number().refine((n) => !doseError(n)),
      timeH: z.number(),
    })).min(1).max(MAX_DOSES_PER_DRUG),
  })).min(1).max(MAX_REPORT_DRUGS),
}).refine(({ drugs, tEndH }) =>
  new Set(drugs.map(({ id }) => id)).size === drugs.length &&
  drugs.every(({ doses }) => doses.every(({ timeH }) => !doseTimeError(timeH, tEndH))),
);

type SavedSetup = z.infer<typeof setup>;
const keyFor = (mode: Mode) => `dib-last-run:${mode}:1`;

export function decodeSavedSetup(raw: string, mode: Mode): SavedSetup | null {
  try {
    const parsed = setup.safeParse(JSON.parse(raw));
    const contexts = mode === "guided" ? GUIDED_CONDITIONS : LAB_CONDITIONS;
    return parsed.success && contexts.some(({ id }) => id === parsed.data.conditionId) ? parsed.data : null;
  } catch {
    return null;
  }
}

function readSetup(mode: Mode): SavedSetup | null {
  try {
    const raw = window.localStorage.getItem(keyFor(mode));
    return raw ? decodeSavedSetup(raw, mode) : null;
  } catch {
    return null;
  }
}

export function hasSavedSetup(mode: Mode): boolean {
  return readSetup(mode) !== null;
}

function persist(mode: Mode, input: SavedSetup) {
  const parsed = setup.safeParse(input);
  if (!parsed.success) return;
  try {
    window.localStorage.setItem(keyFor(mode), JSON.stringify(parsed.data));
  } catch {
    // Private browsing or browser storage settings can prevent persistence.
  }
}

export function persistGuidedSetup(input: GuidedInput) {
  const { conditionId, ageYears, weightKg, sex, tEndH } = input;
  persist("guided", {
    conditionId, ageYears, weightKg, sex, tEndH,
    drugs: input.drugs.map(({ drug: { id, name }, doses, offline }) => ({ id, name, doses, offline })),
  });
}

export function persistLabSetup(input: LabInput) {
  const { conditionId, ageYears, weightKg, sex, tEndH, organProfiles, clearanceScenario, importedPdf } = input;
  persist("lab", {
    conditionId, ageYears: Number(ageYears), weightKg: Number(weightKg), sex, tEndH, organProfiles, clearanceScenario, importedPdf,
    drugs: input.drugs.map(({ drugId: id, name, offline, doses }) => ({
      id, name, offline,
      doses: doses.map(({ doseMg, timeH }) => ({
        doseMg: Number(doseMg), timeH: timeH.trim() === "" ? NaN : Number(timeH),
      })),
    })),
  });
}

async function resolveSaved(saved: SavedSetup) {
  const resolved = await Promise.all(saved.drugs.map(async (line) => {
    const known = STUDY_CASES.find(({ id }) => id === line.id)?.input.drugs[0]?.drug
      ?? (line.id === exampleDrug.id ? exampleDrug : undefined);
    const result: ResolvedDrug | null = known
      ? { drug: known, citations: [], offline: false }
      : await resolveCatalogueDrug(line.id, line.name, line.offline);
    return result ? { ...result, doses: line.doses } : null;
  }));
  // A partial medication list would silently change the configured run.
  return resolved.every((line) => line !== null) ? resolved : null;
}

export function useGuidedSetup(setDraft: Dispatch<SetStateAction<GuidedInput>>, initial: GuidedInput) {
  useEffect(() => {
    let current = true;
    const saved = readSetup("guided");
    if (saved) void resolveSaved(saved).then((drugs) => {
      if (!current || !drugs) return;
      const { conditionId, ageYears, weightKg, sex, tEndH } = saved;
      setDraft((draft) => draft === initial ? { ...draft, conditionId, ageYears, weightKg, sex, tEndH, drugs } : draft);
    });
    return () => { current = false; };
  }, [initial, setDraft]);
}

export function useLabSetup(setDraft: Dispatch<SetStateAction<LabInput>>, initial: LabInput) {
  useEffect(() => {
    let current = true;
    const saved = readSetup("lab");
    if (saved) void resolveSaved(saved).then((drugs) => {
      if (!current || !drugs) return;
      const { conditionId, ageYears, weightKg, sex, tEndH, organProfiles, clearanceScenario, importedPdf } = saved;
      setDraft((draft) => draft === initial ? {
        ...draft, conditionId, ageYears: String(ageYears), weightKg: String(weightKg), sex, tEndH, importedPdf,
        organProfiles: organProfiles ?? draft.organProfiles, clearanceScenario: clearanceScenario ?? draft.clearanceScenario,
        drugs: drugs.map(({ drug, doses, offline }) => ({
          drugId: drug.id, name: drug.name, offline, sourceUrl: drug.sources[0],
          doseRange: drug.studied_dose_range_mg, hasPk: true,
          doses: doses.map(({ doseMg, timeH }) => ({ doseMg: String(doseMg), timeH: String(timeH) })),
        })),
      } : draft);
    });
    return () => { current = false; };
  }, [initial, setDraft]);
}
