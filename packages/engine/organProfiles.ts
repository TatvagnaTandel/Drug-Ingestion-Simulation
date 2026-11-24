import heart from "../../data/organ-profiles/heart/heart_profiles.json";
import kidney from "../../data/organ-profiles/kidney/kidney_profiles.json";
import liver from "../../data/organ-profiles/liver/liver_profiles.json";
import lung from "../../data/organ-profiles/lung/lung_profiles.json";
import type {
  HeartProfile,
  KidneyProfile,
  LiverProfile,
  LungProfile,
  OrganProfileSelection,
} from "./organProfilesTypes";

export * from "./organProfilesTypes";
export const HEART_PROFILES = heart.profiles as readonly HeartProfile[];
export const KIDNEY_PROFILES = kidney.profiles as readonly KidneyProfile[];
export const LIVER_PROFILES = liver.profiles as readonly LiverProfile[];
export const LUNG_PROFILES = lung.profiles as readonly LungProfile[];

export function getHeartProfile(id?: string | null): HeartProfile {
  return (
    HEART_PROFILES.find((p) => p.profile_id === id) ?? HEART_PROFILES[0]
  );
}

export function getKidneyProfile(id?: string | null): KidneyProfile {
  return (
    KIDNEY_PROFILES.find((p) => p.profile_id === id) ?? KIDNEY_PROFILES[0]
  );
}

export function getLiverProfile(id?: string | null): LiverProfile {
  return (
    LIVER_PROFILES.find((p) => p.profile_id === id) ?? LIVER_PROFILES[0]
  );
}

export function getLungProfile(id?: string | null): LungProfile {
  return (
    LUNG_PROFILES.find((p) => p.profile_id === id) ?? LUNG_PROFILES[0]
  );
}

export function getDefaultOrganProfiles(): Required<OrganProfileSelection> {
  return {
    heartId: "heart_healthy_adult",
    kidneyId: "kidney_healthy_adult",
    liverId: "liver_healthy_adult",
    lungId: "lung_healthy_adult",
  };
}

/** Synthetic hepatic and renal clearance contributions with equal baseline weights. */
export function computeOrganAdjustments(selection?: OrganProfileSelection, scenarioMultiplier = 1) {
  if (!Number.isFinite(scenarioMultiplier) || scenarioMultiplier < 0.01 || scenarioMultiplier > 1) {
    throw new Error('clearanceMultiplier must be finite and in [0.01, 1]');
  }
  const hepaticFactor = getLiverProfile(selection?.liverId).clearance_scaling_factor;
  const renalFactor = getKidneyProfile(selection?.kidneyId).clearance_scaling_factor;
  const organProfileMultiplier = (hepaticFactor + renalFactor) / 2;
  return {
    clearanceMultiplier: organProfileMultiplier * scenarioMultiplier,
    organProfileMultiplier,
    hepaticFactor,
    renalFactor,
  };
}

/**
 * Dynamic response calculations for organs responding to drug concentration and clearance.
 * Uses physiological sensitivity multipliers from the dataset archetypes.
 */

export function computeHeartDynamic(
  profile: HeartProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const sensConduction = profile.conduction_sensitivity_multiplier;
  const sensTox = profile.cardiotoxic_sensitivity_multiplier;

  // Heart rate response (e.g. chronotropic stimulation / compensatory reflex)
  const deltaHr = Math.round(norm * 18 * sensConduction);
  const currentHr = profile.resting_heart_rate_bpm + deltaHr;

  // QT prolongation
  const deltaQt = Math.round(norm * 35 * sensConduction);
  const currentQt = profile.baseline_qt_interval_ms + deltaQt;

  // Ejection fraction depression under cardiotoxic strain
  const currentLvef = Math.max(15, profile.lvef_pct - Math.round(norm * 6 * sensTox));
  const deltaLvef = currentLvef - profile.lvef_pct;

  // Cardiac output tracks stroke volume & rate
  const coScale = (currentHr / profile.resting_heart_rate_bpm) * (currentLvef / profile.lvef_pct);
  const currentCo = Number((profile.cardiac_output_l_min * coScale).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * 0.7 + (deltaQt / 80) * 0.3);

  return {
    currentHr,
    deltaHr,
    currentQt,
    deltaQt,
    currentLvef,
    deltaLvef,
    currentCo,
    stress,
  };
}

export function computeKidneyDynamic(
  profile: KidneyProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const sensTox = profile.nephrotoxic_sensitivity_multiplier;

  // eGFR transient decrease during peak drug concentration
  const maxDrop = Math.min(profile.egfr_ml_min_1_73m2 * 0.25, 20);
  const currentEgfr = Math.max(5, Number((profile.egfr_ml_min_1_73m2 - norm * maxDrop * (sensTox / 1.5)).toFixed(1)));
  const deltaEgfr = Number((currentEgfr - profile.egfr_ml_min_1_73m2).toFixed(1));

  // Serum creatinine rises inversely to eGFR filtration changes
  const crRatio = profile.egfr_ml_min_1_73m2 / currentEgfr;
  const currentCr = Number((profile.serum_creatinine_mg_dl * crRatio).toFixed(2));
  const deltaCr = Number((currentCr - profile.serum_creatinine_mg_dl).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * (sensTox / 2.0));

  return {
    currentEgfr,
    deltaEgfr,
    currentCr,
    deltaCr,
    stress,
  };
}

export function computeLiverDynamic(
  profile: LiverProfile,
  elimMgPerH: number,
  peakElim: number
) {
  const norm = peakElim > 1e-9 ? Math.max(0, Math.min(1.5, elimMgPerH / peakElim)) : 0;
  const sensTox = profile.hepatotoxic_sensitivity_multiplier;

  // ALT / AST transient enzyme release under active clearance workload
  const deltaAlt = Math.round(norm * 35 * sensTox);
  const currentAlt = profile.alt_u_l + deltaAlt;

  const deltaAst = Math.round(norm * 25 * sensTox);
  const currentAst = profile.ast_u_l + deltaAst;

  // Metabolic workload relative to functional CYP capacity
  const cypCapacity = Math.max(0.15, profile.cyp450_activity_multiplier);
  const workloadPct = Math.min(100, Math.round((norm / cypCapacity) * 80));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, (workloadPct / 100) * 0.7 + (norm * sensTox * 0.3));

  return {
    currentAlt,
    deltaAlt,
    currentAst,
    deltaAst,
    workloadPct,
    stress,
  };
}

export function computeLungDynamic(
  profile: LungProfile,
  concMgPerL: number,
  peakConc: number
) {
  const norm = peakConc > 1e-9 ? Math.max(0, Math.min(1.5, concMgPerL / peakConc)) : 0;
  const airwayResist = profile.airway_resistance_multiplier;
  const driveSens = profile.respiratory_drive_sensitivity;

  // SpO2 dip under systemic drug exposure, accentuated in high airway resistance / V/Q mismatch
  const maxDrop = 3 * airwayResist * (1 / driveSens);
  const currentSpo2 = Math.max(75, profile.spo2_rest_pct - Math.round(norm * maxDrop));
  const deltaSpo2 = currentSpo2 - profile.spo2_rest_pct;

  // Compensatory respiratory rate modulation
  const deltaRr = Math.round(norm * 4 * driveSens);
  const currentRr = profile.respiratory_rate_bpm + deltaRr;

  // Dynamic airway resistance under drug effect
  const currentAirwayResist = Number((airwayResist * (1 + norm * 0.25)).toFixed(2));

  // Stress index for graph trace (0..1)
  const stress = Math.min(1, norm * 0.6 + (Math.abs(deltaSpo2) / 6) * 0.4);

  return {
    currentSpo2,
    deltaSpo2,
    currentRr,
    deltaRr,
    currentAirwayResist,
    stress,
  };
}
