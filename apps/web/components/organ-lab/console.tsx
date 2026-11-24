"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { MedicineSearch } from "@/components/simulator/catalogue-search";
import { MedicineChips, SetupStep, SetupSummary, SyntheticSetupNotice } from "@/components/simulator/setup-steps";
import { FieldIssue, RunButton, useFieldReview, type FieldReview } from "@/components/simulator/form-validation";
import { ageError, doseError, doseTimeError, weightError, windowError } from "@/lib/setup-validation";
import { CONDITIONS, conditionById } from "./condition";
import { suggestionsFor } from "./medicine-suggestions";
import { parsePrescription } from "@/components/simulator/prescription";
import {
  CLEARANCE_SCENARIOS,
  SCENARIO_CONTEXT,
  type ClearanceScenarioId,
} from "@/lib/kidney-scenario";
import { MAX_DOSES_PER_DRUG, MAX_REPORT_DRUGS, type DrugParameterCitation } from "@dib/data-client";
import { ChevronDown } from "lucide-react";
import { exampleDrug } from "@/lib/example-drug";
import { isValidated } from "@/lib/validation-status";
import { PDF_SIZE_LIMIT_MB, readMedicalPdf } from "@/lib/pdf-import";
import { reviewPdfMatch, type PdfFieldMatch } from "@/lib/pdf-parse";
import { applyPdfImport } from "./apply-pdf";
import {
  HEART_PROFILES,
  KIDNEY_PROFILES,
  LIVER_PROFILES,
  LUNG_PROFILES,
  type OrganProfileSelection,
  type HeartProfileId,
  type KidneyProfileId,
  type LiverProfileId,
  type LungProfileId,
} from "@dib/engine";

/**
 * Number boxes keep their text. An empty box is an empty string — never a 0
 * quietly put back by a change or blur handler.
 */
export type DoseRow = {
  timeH: string;
  doseMg: string;
  doseFromPdf?: boolean;
  timeFromPdf?: boolean;
};

/** A value from a PDF that had no matching box, shown as its own input. */
export type ExtraField = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  range?: string;
  fromPdf?: boolean;
};

/** One medicine in the treatment: identity from the catalogue, rows editable. */
export type DrugLine = {
  /** The catalogue's normalized ingredient id. */
  drugId: string;
  name: string;
  doses: DoseRow[];
  /** The range the source studied, from the approved PK row. */
  doseRange: [number, number] | null;
  /** Whether an approved PK row exists at all; without one, no run. */
  hasPk: boolean;
  offline?: boolean;
  sourceUrl?: string;
};

export type SimulatorInput = {
  conditionId: string;
  description: string;
  ageYears: string;
  weightKg: string;
  sex: "" | "female" | "male" | "other";
  drugs: DrugLine[];
  tEndH: number;
  organProfiles?: OrganProfileSelection;
  /** An extra synthetic what-if on clearance, on top of the organ profiles. */
  clearanceScenario: ClearanceScenarioId;
  /** Values from an uploaded PDF with no matching built-in box. */
  extraFields?: ExtraField[];
  /** True when age was filled from a PDF, for the "from PDF" badge. */
  ageFromPdf?: boolean;
  /** True when weight was filled from a PDF, for the "from PDF" badge. */
  weightFromPdf?: boolean;
  windowFromPdf?: boolean;
  importedPdf?: boolean;
};

type ConsoleProps = {
  value: SimulatorInput;
  onChange: React.Dispatch<React.SetStateAction<SimulatorInput>>;
  onSubmit: () => void;
  /** Shown under the form: what is wrong with the input, if anything. */
  error: string | null;
  disabled?: boolean;
  actions?: ReactNode;
  /** The citation behind each value of each medicine's parameters. */
  citations?: Map<string, DrugParameterCitation[]>;
};

const fieldLabel = "mb-1.5 block text-xs font-medium text-ink-2";
const inputClass = "theatre-field w-full min-w-0";
const smallInputClass = "theatre-field min-w-0";
const ghostButtonClass = "theatre-button theatre-ghost";

export default function SimulatorConsole({
  value,
  onChange,
  onSubmit,
  error,
  disabled,
  actions,
  citations,
}: ConsoleProps) {
  const set = useCallback(
    <K extends keyof SimulatorInput>(key: K, next: SimulatorInput[K]) => {
      onChange((current) => ({
        ...current,
        [key]: next,
        ...(key === "ageYears" ? { ageFromPdf: false } : {}),
        ...(key === "weightKg" ? { weightFromPdf: false } : {}),
      }));
    },
    [onChange]
  );

  /** Patch one drug line, in place. */
  const setDrug = useCallback(
    (index: number, patch: Partial<DrugLine>) => {
      onChange({
        ...value,
        drugs: value.drugs.map((d, i) => (i === index ? { ...d, ...patch } : d)),
      });
    },
    [onChange, value]
  );

  const medicines = value.drugs.map(({ drugId, name, doses }) => ({ id: drugId, name, doses }));
  const review = useFieldReview();
  const ageIssue = ageError(value.ageYears);
  const weightIssue = weightError(value.weightKg);
  const windowIssue = windowError(value.tEndH);
  const medicinesIssue = value.drugs.length === 0 ? "Add a medicine to run." : null;
  const scheduleReason = value.drugs.find((line) => !line.doses.length || line.doses.some((row) =>
    doseError(row.doseMg) || doseTimeError(row.timeH, value.tEndH),
  ));
  const unsourced = value.drugs.find((line) => !line.hasPk);
  const reason = (ageIssue ? "Check the age to run." : null)
    ?? (weightIssue ? "Check the weight to run." : null)
    ?? (windowIssue ? "Choose a valid simulation window to run." : null)
    ?? medicinesIssue
    ?? (unsourced ? `Remove ${unsourced.name} to run this setup.` : null)
    ?? (scheduleReason ? `Complete the dose schedule for ${scheduleReason.name} to run.` : null);

  return (
    <form
      className="@container space-y-4"
      noValidate
      onBlurCapture={review.blur}
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (reason) {
          review.attempt();
          return;
        }
        onSubmit();
      }}
    >
      <div className="grid items-start gap-4 @min-[800px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <SetupStep number={1}>
          <MedicineSearch
            selectedIds={medicines.map(({ id }) => id)}
            issue={medicinesIssue}
            review={review}
            examples={{ label: conditionById(value.conditionId).label, medicines: suggestionsFor(value.conditionId) }}
            onAdd={({ drug, offline }) =>
              onChange((current) => {
                if (current.drugs.length >= MAX_REPORT_DRUGS || current.drugs.some((line) => line.drugId === drug.id)) return current;
                return {
                  ...current,
                  drugs: [...current.drugs, {
                    drugId: drug.id,
                    name: drug.name,
                    doses: [{ timeH: "0", doseMg: "" }],
                    doseRange: drug.studied_dose_range_mg,
                    offline,
                    sourceUrl: drug.sources[0],
                    hasPk: true,
                  }],
                };
              })
            }
          />
          {medicines.some(({ id }) => id === exampleDrug.id) ? <SyntheticSetupNotice /> : null}
          <MedicineChips
            medicines={medicines}
            onRemove={(id) => onChange((current) => ({ ...current, drugs: current.drugs.filter((line) => line.drugId !== id) }))}
          />
          <div className="space-y-2">
            {value.drugs.map((drug, index) => (
              <DrugCard
                key={drug.drugId}
                citations={citations?.get(drug.drugId)}
                drug={drug}
                index={index}
                tEndH={value.tEndH}
                review={review}
                onPatch={(patch) => setDrug(index, patch)}
                onLoadScript={(doses, neededWindowH) => {
                  const tEndH = Math.max(value.tEndH, neededWindowH);
                  onChange({
                    ...value,
                    tEndH,
                    windowFromPdf: value.windowFromPdf && tEndH === value.tEndH,
                    drugs: value.drugs.map((d, i) =>
                      i === index
                        ? {
                            ...d,
                            doses,
                          }
                        : d
                    ),
                  });
                }}
              />
            ))}
          </div>
          <PdfUpload value={value} onChange={onChange} />
        </SetupStep>
        <SetupStep number={2}>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)] gap-2.5">
              <div>
                <label className="mb-1.5 block text-xs text-ink-2" htmlFor="age">
                  Age (years)
                </label>
                <input
                  id="age"
                  min={1}
                  max={120}
                  type="number"
                  step={1}
                  inputMode="numeric"
                  value={value.ageYears}
                  onChange={(event) => set("ageYears", event.target.value)}
                  className={inputClass}
                  {...review.props("age", ageIssue)}
                />
                {value.ageFromPdf ? <p className="mt-1 text-xs text-ink-2">From PDF</p> : null}
                {review.issue("age", ageIssue)}
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-ink-2" htmlFor="weight">
                  Weight (kg)
                </label>
                <input
                  id="weight"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={value.weightKg}
                  onChange={(event) => set("weightKg", event.target.value)}
                  className={inputClass}
                  {...review.props("weight", weightIssue)}
                />
                {value.weightFromPdf ? <p className="mt-1 text-xs text-ink-2">From PDF</p> : null}
                {review.issue("weight", weightIssue)}
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-ink-2" htmlFor="sex">
                  Sex
                </label>
                <select
                  id="sex"
                  value={value.sex}
                  onChange={(event) => set("sex", event.target.value as SimulatorInput["sex"])}
                  className="theatre-select w-full min-w-0"
                >
                  <option value="">Not specified</option>
                  <option value="female" className="bg-surface text-ink">
                    Female
                  </option>
                  <option value="male" className="bg-surface text-ink">
                    Male
                  </option>
                  <option value="other" className="bg-surface text-ink">
                    Other
                  </option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-4 text-ink-3">
              Weight scales volume and clearance. Age and sex are profile labels.
            </p>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="condition">
              Walkthrough context
            </label>
            <select
              id="condition"
              value={value.conditionId}
              onChange={(event) => {
                set("conditionId", event.target.value);
              }}
              className="theatre-select w-full min-w-0"
            >
              {CONDITIONS.map((condition) => (
                <option key={condition.id} value={condition.id} className="bg-surface text-ink">
                  {condition.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs leading-5 text-ink-2">Sets the walkthrough topic and catalogue examples.</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">
              {CONDITIONS.find((c) => c.id === value.conditionId)?.blurb ??
                "A plain dose with nothing in particular to watch."}
            </p>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              rows={2}
              value={value.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Optional notes about this fictional case"
              className={`${inputClass} resize-y leading-6`}
            />
            <p className="mt-2 text-[12px] leading-4 text-ink-3">
              Your notes are included when you save the report. Use fictional details.
            </p>
          </div>

          {/* Values from a PDF that had no matching box above. */}
          {value.extraFields && value.extraFields.length > 0 ? (
            <div className="rounded-xl border border-line bg-surface/40 p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className={fieldLabel}>Values from the PDF</span>
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-brand-text">
                  {value.extraFields.length} added
                </span>
              </div>
              <p className="text-xs leading-4 text-ink-3">
                These had no matching input above. Check each value before running.
              </p>
              <div className="mt-3 space-y-2">
                {value.extraFields.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <label className="min-w-0 flex-1" htmlFor={`extra-${field.key}`}>
                      <span className="block truncate text-[12px] text-ink-2" title={field.label}>
                        {field.label}
                      </span>
                      {field.fromPdf ? (
                        <span className="font-mono text-xs uppercase tracking-[0.1em] text-brand-text">
                          from PDF
                        </span>
                      ) : null}
                    </label>
                    <input
                      id={`extra-${field.key}`}
                      type="number"
                      value={field.value}
                      onChange={(event) =>
                        set("extraFields", (value.extraFields ?? []).map((f) =>
                          f.key === field.key ? { ...f, value: event.target.value } : f
                        ))
                      }
                      className={`${smallInputClass} w-28`}
                    />
                    {field.unit ? (
                      <span className="shrink-0 font-mono text-xs text-ink-3">{field.unit}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        set("extraFields", (value.extraFields ?? []).filter((f) => f.key !== field.key))
                      }
                      className="relative shrink-0 font-mono text-xs uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-3 after:content-[''] hover:text-[color:var(--manava-error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      aria-label={`Remove ${field.label}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <details className="theatre-disclosure">
            <summary>
              Organ settings
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="mt-3 space-y-3">
              {/* Organ Archetype Profiles */}
              <div className="rounded-xl border border-line bg-surface/40 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span className={fieldLabel}>Organ Archetypes & Physiology</span>
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-brand-text">
                    Multi-Organ Reference
                  </span>
                </div>
                <p className="text-xs leading-4 text-ink-3 mb-3">
                  Synthetic clinical archetypes for cardiovascular, renal, hepatic, and pulmonary function.
                </p>

                <div className="space-y-3">
                  {/* Heart */}
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="heart-profile">
                      Heart ({HEART_PROFILES.find((p) => p.profile_id === value.organProfiles?.heartId)?.nyha_class === "none" ? "Healthy" : `NYHA ${HEART_PROFILES.find((p) => p.profile_id === value.organProfiles?.heartId)?.nyha_class}`})
                    </label>
                    <select
                      id="heart-profile"
                      value={value.organProfiles?.heartId ?? "heart_healthy_adult"}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          organProfiles: {
                            ...value.organProfiles,
                            heartId: e.target.value as HeartProfileId,
                          },
                        })
                      }
                      className="theatre-select w-full min-w-0 text-xs"
                    >
                      {HEART_PROFILES.map((p) => (
                        <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                          {p.label} (LVEF {p.lvef_pct}%, HR {p.resting_heart_rate_bpm})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Kidney */}
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="kidney-profile">
                      Kidneys ({KIDNEY_PROFILES.find((p) => p.profile_id === value.organProfiles?.kidneyId)?.ckd_stage})
                    </label>
                    <select
                      id="kidney-profile"
                      value={value.organProfiles?.kidneyId ?? "kidney_healthy_adult"}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          organProfiles: {
                            ...value.organProfiles,
                            kidneyId: e.target.value as KidneyProfileId,
                          },
                        })
                      }
                      className="theatre-select w-full min-w-0 text-xs"
                    >
                      {KIDNEY_PROFILES.map((p) => (
                        <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                          {p.label} (eGFR {p.egfr_ml_min_1_73m2}, CL scale {(p.clearance_scaling_factor * 100).toFixed(0)}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Liver */}
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="liver-profile">
                      Liver ({LIVER_PROFILES.find((p) => p.profile_id === value.organProfiles?.liverId)?.child_pugh_class === "none" ? "Normal" : `Child-Pugh ${LIVER_PROFILES.find((p) => p.profile_id === value.organProfiles?.liverId)?.child_pugh_class}`})
                    </label>
                    <select
                      id="liver-profile"
                      value={value.organProfiles?.liverId ?? "liver_healthy_adult"}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          organProfiles: {
                            ...value.organProfiles,
                            liverId: e.target.value as LiverProfileId,
                          },
                        })
                      }
                      className="theatre-select w-full min-w-0 text-xs"
                    >
                      {LIVER_PROFILES.map((p) => (
                        <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                          {p.label} (CL scale {(p.clearance_scaling_factor * 100).toFixed(0)}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lungs */}
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-[0.1em] text-ink-2 mb-1" htmlFor="lung-profile">
                      Lungs ({LUNG_PROFILES.find((p) => p.profile_id === value.organProfiles?.lungId)?.smoking_status === "never" ? "Non-smoker" : `Smoker (${LUNG_PROFILES.find((p) => p.profile_id === value.organProfiles?.lungId)?.pack_years} pack-yrs)`})
                    </label>
                    <select
                      id="lung-profile"
                      value={value.organProfiles?.lungId ?? "lung_healthy_adult"}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          organProfiles: {
                            ...value.organProfiles,
                            lungId: e.target.value as LungProfileId,
                          },
                        })
                      }
                      className="theatre-select w-full min-w-0 text-xs"
                    >
                      {LUNG_PROFILES.map((p) => (
                        <option key={p.profile_id} value={p.profile_id} className="bg-surface text-ink">
                          {p.label} (FEV1 {p.fev1_pct_predicted}%, SpO2 {p.spo2_rest_pct}%)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Extra clearance what-if — a model setting, never a patient measurement. */}
              <fieldset>
                <legend className={fieldLabel}>Model what-if · extra clearance</legend>
                <p className="mb-2 text-xs leading-4 text-ink-3">
                  Compare the same organ profiles and dose schedule with and without the extra clearance multiplier.
                </p>
                <div className="space-y-1.5">
                  {CLEARANCE_SCENARIOS.map((scenario) => (
                    <label
                      key={scenario.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface/60 px-3 py-2 transition-colors duration-150 hover:border-line-strong focus-within:border-brand motion-reduce:transition-none"
                    >
                      <input
                        type="radio"
                        name="clearance-scenario"
                        value={scenario.id}
                        checked={value.clearanceScenario === scenario.id}
                        onChange={() => set("clearanceScenario", scenario.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--peach)]"
                      />
                      <span>
                        <span className="block text-[13px] text-ink">{scenario.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-ink-3">
                          {scenario.note}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-4 text-ink-3">{SCENARIO_CONTEXT}</p>
              </fieldset>
            </div>
          </details>
        </SetupStep>
      </div>
      <SetupStep number={3}>
        <div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-2" htmlFor="tend">
              Duration
            </label>
            <select
              id="tend"
              {...review.props("tend", windowIssue)}
              value={value.tEndH}
              onChange={(event) => {
                onChange({ ...value, tEndH: Number(event.target.value), windowFromPdf: false });
              }}
              className="theatre-select"
            >
              {[...new Set([12, 24, 48, 72, value.tEndH])].sort((a, b) => a - b).map((hours) => (
                <option key={hours} value={hours}>{hours} h</option>
              ))}
            </select>
            {value.windowFromPdf ? <span className="text-xs text-ink-3">From PDF</span> : null}
          </div>
          <p className="mt-2 text-[12px] leading-4 text-ink-3">
            The simulated window, shared by every medicine in the treatment.
          </p>
          {review.issue("tend", windowIssue)}
        </div>
        <SetupSummary medicines={medicines} age={value.ageYears} weight={value.weightKg} sex={value.sex} hours={value.tEndH} />
        {error ? <FieldIssue>{error}</FieldIssue> : null}
        <RunButton reason={reason} attempted={review.attempted} busy={disabled}>{actions}</RunButton>
        <p className="text-xs text-ink-2">This browser keeps the settings from your last custom run.</p>
      </SetupStep>
    </form>
  );
}

/* ---- upload a medical PDF ----------------------------------------------- */

function PdfUpload({
  value,
  onChange,
}: {
  value: SimulatorInput;
  onChange: React.Dispatch<React.SetStateAction<SimulatorInput>>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{ match: PdfFieldMatch; value: string; unit: string }[] | null>(null);
  const [destination, setDestination] = useState("");
  const reviewed = pending?.map(({ match, value, unit }) => reviewPdfMatch(match, value, unit)) ?? [];
  const matches = reviewed.filter((match) => match !== null);
  const ready = matches.length > 0 && matches.length === reviewed.length;
  const canAttach = matches.filter(({ key }) => key === "doseMg").length === 1 &&
    matches.filter(({ key }) => key === "timeH").length === 1;
  const changeReview = (index: number, patch: { value?: string; unit?: string }) =>
    setPending((rows) => rows?.map((row, i) => i === index ? { ...row, ...patch } : row) ?? null);

  const read = async (file: File) => {
    setBusy(true);
    setError(null);
    setNote(null);
    setPending(null);
    setDestination("");
    try {
      const { matches } = await readMedicalPdf(file);
      setPending(matches.map((match) => ({ match, value: match.value, unit: match.unit ?? "" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF could not be read.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-2">
            Upload a medical PDF
          </p>
          <p className="mt-0.5 text-xs leading-4 text-ink-2">
            Use fictional sample reports up to {PDF_SIZE_LIMIT_MB} MB. The file stays in this browser. Review the numbers before applying them.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={`${ghostButtonClass} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {busy ? "Reading…" : "Choose PDF"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Upload a medical PDF"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />
      {error ? (
        <p role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[12px] leading-4 text-[color:var(--manava-error)]">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div className="mt-3 space-y-2">
          <div className="max-h-80 overflow-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="PDF review table">
            <table className="w-full min-w-[28rem] text-left text-xs text-ink-2">
              <caption className="p-2 text-left font-semibold text-ink">Review extracted values</caption>
              <thead className="border-b border-line bg-surface">
                <tr>
                  <th className="p-2" scope="col">Field</th>
                  <th className="p-2" scope="col">Value</th>
                  <th className="p-2" scope="col">Unit</th>
                  <th className="p-2" scope="col">Source snippet</th>
                  <th className="p-2" scope="col">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(({ match, value, unit }, index) => (
                  <tr key={index} className="border-b border-line last:border-0">
                    <th className="p-2 font-medium text-ink" scope="row">{match.name}</th>
                    <td className="p-2">
                      <input
                        aria-label={`${match.name} value, row ${index + 1}`}
                        aria-invalid={!reviewed[index]}
                        className={`${smallInputClass} w-20`}
                        type="text"
                        inputMode="decimal"
                        maxLength={24}
                        value={value}
                        onChange={(event) => changeReview(index, { value: event.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`${match.name} unit, row ${index + 1}`}
                        className={`${smallInputClass} w-20`}
                        maxLength={24}
                        value={unit}
                        onChange={(event) => changeReview(index, { unit: event.target.value })}
                      />
                    </td>
                    <td className="min-w-32 break-words p-2"><q>{match.raw}</q></td>
                    <td className="p-2">{match.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canAttach && value.drugs.length > 0 ? (
            <label className="block text-[12px] text-ink-2">
              Add the dose and time to
              <select className={`${smallInputClass} mt-1 w-full`} value={destination} onChange={(event) => setDestination(event.target.value)}>
                <option value="">Supplemental fields only</option>
                {value.drugs.map((drug) => <option key={drug.drugId} value={drug.drugId}>{drug.name}</option>)}
              </select>
            </label>
          ) : null}
          <p className="text-xs leading-4 text-ink-2">High confidence means the reader matched a label, unit and range. Check every row against its source. Unmatched values remain supplemental.</p>
          {!ready ? <FieldIssue>Enter a number for each row before applying.</FieldIssue> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!ready} className={`${ghostButtonClass} disabled:opacity-55`} onClick={() => {
              onChange((current) => applyPdfImport(current, { matches }, canAttach ? destination : ""));
              setPending(null);
              setNote("Reviewed values applied to this local draft.");
            }}>Apply reviewed values</button>
            <button type="button" className={ghostButtonClass} onClick={() => setPending(null)}>Discard</button>
          </div>
        </div>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 text-[12px] leading-4 text-brand-text">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ---- the sources behind a medicine's numbers -------------------------- */

const PARAMETER_LABELS: Record<string, string> = {
  ka_per_h: "absorption rate",
  f_bioavailability: "bioavailability",
  cl_l_per_h_per_kg: "clearance",
  v_l_per_kg: "volume of distribution",
  dose_min_mg: "dose range from",
  dose_max_mg: "dose range to",
  t_half_h: "half-life",
  t_max_h: "time to peak",
};

const PARAMETER_ORDER = [
  "ka_per_h",
  "f_bioavailability",
  "cl_l_per_h_per_kg",
  "v_l_per_kg",
  "dose_min_mg",
  "dose_max_mg",
  "t_half_h",
  "t_max_h",
];

/**
 * Where each of a medicine's numbers came from.
 *
 * Every value is listed with the document that states it, so a number is never
 * just a number. A citation that covers the whole row rather than one value
 * says so, instead of pretending to be more specific than it is.
 */
function Sources({ citations }: { citations?: DrugParameterCitation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  const ordered = [...citations].sort(
    (a, b) =>
      PARAMETER_ORDER.indexOf(a.parameter) - PARAMETER_ORDER.indexOf(b.parameter)
  );
  const documents = new Set(citations.map((c) => c.sourceUrl));

  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
      >
        {open ? "hide sources" : `sources (${documents.size} document${documents.size === 1 ? "" : "s"})`}
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {ordered.map((citation) => (
            <li key={citation.parameter} className="text-[12px] leading-4 text-ink-2">
              <span className="font-mono text-xs text-ink">
                {PARAMETER_LABELS[citation.parameter] ?? citation.parameter}
              </span>
              {citation.value != null ? (
                <span className="ml-1.5 font-mono text-xs text-brand-text">{citation.value}</span>
              ) : null}
              <span className="ml-1.5 text-ink-3">
                {citation.sourceKind === "other" ? "cited at document level" : "· cited"}
                {citation.population ? ` · ${citation.population}` : ""}
              </span>
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-0.5 block truncate text-ink-3 underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {citation.sourceTitle || citation.sourceUrl}
              </a>
              <q className="mt-0.5 block text-xs leading-4 text-ink-3"> {citation.sourceQuote} </q>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---- one medicine's card ------------------------------------------------- */

function DrugCard({
  drug,
  index,
  tEndH,
  review,
  onPatch,
  onLoadScript,
  citations,
}: {
  drug: DrugLine;
  index: number;
  tEndH: number;
  review: FieldReview;
  onPatch: (patch: Partial<DrugLine>) => void;
  /** Applies a parsed script: the parent widens the shared window if needed. */
  onLoadScript: (doses: DoseRow[], neededWindowH: number) => void;
  /** The citation behind each of this medicine's parameter values. */
  citations?: DrugParameterCitation[];
}) {
  const [script, setScript] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** The per-drug prescription: a loader into this card's dose rows. */
  const loadScript = useCallback(() => {
    const parsed = parsePrescription(script);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    onLoadScript(parsed.doses.map(({ doseMg, timeH }) => ({ doseMg: String(doseMg), timeH: String(timeH) })), parsed.tEndH);
    setNote(
      `Loaded ${parsed.doses.length} dose${parsed.doses.length === 1 ? "" : "s"} for this medicine.`
    );
  }, [script, onLoadScript]);

  /** The lowest studied bound this drug has; a dose below it is allowed
      with a visible warning, never blocked. */
  const belowMin =
    drug.doseRange?.[0] ?? null;
  const anyBelow =
    belowMin != null &&
    drug.doses.some((r) => {
      const dose = Number(r.doseMg);
      return r.doseMg.trim() !== "" && Number.isFinite(dose) && dose > 0 && dose < belowMin;
    });

  const rangeHint = drug.doseRange
    ? `studied range ${drug.doseRange[0]}–${drug.doseRange[1]} mg`
    : "no studied range on file";

  return (
    <div className="rounded-xl border border-line bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{drug.name}</p>
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">{rangeHint}</p>
          {drug.sourceUrl ? <a href={drug.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-text underline">Parameter source</a> : null}
          {!isValidated(drug.drugId) ? (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-warn">
              Not validated against a published curve
            </p>
          ) : null}
        </div>
      </div>

      {anyBelow === true ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px] leading-4 text-warn"
        >
          Below the lower bound this source studied — allowed, but outside what the evidence covers.
        </p>
      ) : null}

      {/* Script loader for this medicine */}
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor={`script-${index}`}>
          Prescription script for {drug.name}
        </label>
        <input
          id={`script-${index}`}
          type="text"
          value={script}
          onChange={(event) => {
            setScript(event.target.value);
            setNote(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              loadScript();
            }
          }}
          placeholder="200 mg every 8 h for 3 doses"
          className={`${smallInputClass} w-full min-w-0 flex-1`}
        />
        <button type="button" onClick={loadScript} className={`${ghostButtonClass} shrink-0`}>
          Load
        </button>
      </div>
      <Sources citations={citations} />

      {note ? (
        <p className={`mt-1.5 text-[12px] leading-4 ${note.startsWith("Loaded") ? "text-ink-2" : "text-[color:var(--manava-error)]"}`}>
          {note}
        </p>
      ) : null}

      {/* This medicine's dose rows */}
      <div className="mt-2 space-y-1.5">
        {drug.doses.map((row, i) => (
          <div key={i}>
            <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
              d{i + 1}
            </span>
            <label className="sr-only" htmlFor={`dose-${index}-${i}`}>
              {drug.name} dose {i + 1} amount in milligrams
            </label>
            <input
              id={`dose-${index}-${i}`}
              type="number"
              max={10_000}
              step="any"
              inputMode="decimal"
              value={row.doseMg}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, doseMg: event.target.value } : r
                  ),
                })
              }
              {...review.props(`dose-${index}-${i}`, doseError(row.doseMg))}
              className={`${smallInputClass} w-0 min-w-0 flex-1`}
            />
            <span className="shrink-0 font-mono text-xs text-ink-3">
              mg{row.doseFromPdf ? " · PDF" : ""}
            </span>
            <label className="sr-only" htmlFor={`time-${index}-${i}`}>
              {drug.name} dose {i + 1} time in hours
            </label>
            <input
              id={`time-${index}-${i}`}
              type="number"
              min={0}
              max={tEndH}
              step="any"
              inputMode="decimal"
              value={row.timeH}
              onChange={(event) =>
                onPatch({
                  doses: drug.doses.map((r, j) =>
                    j === i ? { ...r, timeH: event.target.value } : r
                  ),
                })
              }
              {...review.props(`time-${index}-${i}`, doseTimeError(row.timeH, tEndH))}
              className={`${smallInputClass} w-0 min-w-0 flex-1`}
            />
            <span className="shrink-0 font-mono text-xs text-ink-3">
              h{row.timeFromPdf ? " · PDF" : ""}
            </span>
            {drug.doses.length > 1 ? (
              <button
                type="button"
                onClick={() => onPatch({ doses: drug.doses.filter((_, j) => j !== i) })}
                className="relative shrink-0 font-mono text-xs uppercase tracking-[0.1em] text-ink-3 transition-colors duration-150 after:absolute after:-inset-3.5 after:content-[''] hover:text-[color:var(--manava-error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                aria-label={`Remove ${drug.name} dose ${i + 1}`}
              >
                ×
              </button>
            ) : null}
            </div>
            {review.issue(`dose-${index}-${i}`, doseError(row.doseMg))}
            {review.issue(`time-${index}-${i}`, doseTimeError(row.timeH, tEndH))}
          </div>
        ))}
        {drug.doses.length === 0 ? review.issue(`add-dose-${index}`, "Add a dose to this medicine.") : null}
        <button
          id={`add-dose-${index}`}
          type="button"
          onClick={() =>
            onPatch({
              doses: [
                ...drug.doses,
                {
                  timeH: drug.doses.length ? String(Math.min(tEndH, Number(drug.doses[drug.doses.length - 1].timeH) + 6)) : "0",
                  doseMg: "",
                },
              ],
            })
          }
          disabled={drug.doses.length >= MAX_DOSES_PER_DRUG}
          className={`${ghostButtonClass} mt-1 disabled:opacity-50`}
        >
          + dose
        </button>
      </div>
    </div>
  );
}
