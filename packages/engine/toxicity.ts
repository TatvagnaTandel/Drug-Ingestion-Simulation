import type { DoseEvent, Drug } from './types';
import {
  getHeartProfile,
  getKidneyProfile,
  getLiverProfile,
  getLungProfile,
  type OrganProfileSelection,
} from './organProfiles';

const RESERVE = { heart: 1, lungs: 1.1, liver: 0.9, kidneys: 1.2, brain: 0.95, gut: 1.6 };
const ORGANS = Object.keys(RESERVE) as ToxicOrgan[];
const VITAL_ORGANS = new Set<ToxicOrgan>(['heart', 'lungs', 'liver', 'brain']);
export const FAILURE_THRESHOLD = 2;

export type ToxicOrgan = keyof typeof RESERVE;

export type OrganFailure = {
  organ: ToxicOrgan;
  drugName: string;
  doseMg: number;
  timeH: number;
  load: number;
};

export type ToxicityResult = {
  organLoad: Record<ToxicOrgan, number>;
  failedOrgans: OrganFailure[];
  death: OrganFailure | null;
  message: string | null;
};

/**
 * Fictional teaching score driven by the excess above a studied dose ceiling.
 * The ceiling describes the source's coverage and carries no safety meaning.
 * Events arrive sorted at their exact, in-window gut entry times.
 */
export function assessToxicity(
  drug: Drug,
  gutEvents: readonly DoseEvent[],
  selected: OrganProfileSelection | undefined,
  clearanceMultiplier: number,
): ToxicityResult | undefined {
  const ceiling = drug.studied_dose_range_mg?.[1];
  if (ceiling == null || !Number.isFinite(ceiling) || ceiling <= 0) return;

  const organLoad = { heart: 0, lungs: 0, liver: 0, kidneys: 0, brain: 0, gut: 0 };
  const sensitivity = {
    heart: getHeartProfile(selected?.heartId).cardiotoxic_sensitivity_multiplier,
    lungs: getLungProfile(selected?.lungId).vq_mismatch_index,
    liver: getLiverProfile(selected?.liverId).hepatotoxic_sensitivity_multiplier,
    kidneys: getKidneyProfile(selected?.kidneyId).nephrotoxic_sensitivity_multiplier,
    brain: 1,
    gut: 1,
  };
  const failedOrgans: OrganFailure[] = [];
  let death: OrganFailure | null = null;
  for (const { doseMg, timeH } of gutEvents) {
    if (doseMg <= ceiling) continue;
    const excess = Math.min(Number.MAX_SAFE_INTEGER, (doseMg / ceiling - 1) / clearanceMultiplier);
    for (const organ of ORGANS) {
      const previous = organLoad[organ];
      // shortcut: cap the teaching score at 100, revisit if a calibrated model replaces it.
      const load = Math.min(100, previous + (excess * sensitivity[organ]) / RESERVE[organ]);
      organLoad[organ] = load;
      if (previous < FAILURE_THRESHOLD && load >= FAILURE_THRESHOLD) {
        const failure = { organ, drugName: drug.name, doseMg, timeH, load };
        failedOrgans.push(failure);
        if (!death && (VITAL_ORGANS.has(organ) || failedOrgans.length === 2)) death = failure;
      }
    }
  }

  const message = death
    ? `The illustrative exercise ends at ${death.timeH.toFixed(2)} h after a modelled ${death.organ} failure.`
    : null;
  return { organLoad, failedOrgans, death, message };
}
