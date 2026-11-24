"use client";

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { MAX_DOSES_PER_DRUG, MAX_REPORT_DRUGS, type DrugParameterCitation } from "@dib/data-client";
import type { Drug } from "@dib/engine";
import { MedicineSearch } from "@/components/simulator/catalogue-search";
import { MedicineChips, SetupStep, SetupSummary, SyntheticSetupNotice } from "@/components/simulator/setup-steps";
import { FieldIssue, RunButton, useFieldReview, type FieldReview } from "@/components/simulator/form-validation";
import { ageError, doseError, doseTimeError, weightError, windowError } from "@/lib/setup-validation";
import { CONDITIONS } from "./condition";
import { parsePrescription } from "./prescription";
import { exampleDrug } from "@/lib/example-drug";
import { VALIDATION_STATUS } from "@/lib/validation-status";

export type DoseRow = {
  timeH: number;
  doseMg: number;
};

/** One medicine in the treatment: identity from the catalogue, rows editable. */
export type DrugLine = {
  drug: Drug;
  doses: DoseRow[];
  citations?: DrugParameterCitation[];
  offline?: boolean;
};

export type SimulatorInput = {
  conditionId: string;
  description: string;
  ageYears: number;
  weightKg: number;
  sex: "" | "female" | "male" | "other";
  drugs: DrugLine[];
  tEndH: number;
};

type ConsoleProps = {
  value: SimulatorInput;
  onChange: Dispatch<SetStateAction<SimulatorInput>>;
  onSubmit: () => void;
  /** Shown under the form: what is wrong with the input, if anything. */
  error: string | null;
  disabled?: boolean;
  actions?: ReactNode;
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
}: ConsoleProps) {
  const demo = value.drugs.some((line) => line.drug.id === exampleDrug.id);
  const set = useCallback(
    <K extends keyof SimulatorInput>(key: K, next: SimulatorInput[K]) => {
      onChange({ ...value, [key]: next });
    },
    [onChange, value]
  );

  function addDrug(drug: Drug, citations?: DrugParameterCitation[], offline?: boolean) {
    onChange((current) => {
      const example = drug.id === exampleDrug.id;
      if (
        current.drugs.length >= MAX_REPORT_DRUGS ||
        current.drugs.some((line) => line.drug.id === drug.id || line.drug.id === exampleDrug.id) ||
        (example && current.drugs.length > 0)
      ) {
        return current;
      }
      return {
        ...current,
        drugs: [...current.drugs, { drug, citations, offline, doses: [{ timeH: 0, doseMg: example ? 100 : NaN }] }],
      };
    });
  }

  /** Patch one drug line. */
  const setDrug = useCallback(
    (index: number, patch: Partial<DrugLine>) => {
      onChange({
        ...value,
        drugs: value.drugs.map((d, i) => (i === index ? { ...d, ...patch } : d)),
      });
    },
    [onChange, value]
  );

  const medicines = value.drugs.map(({ drug, doses }) => ({ id: drug.id, name: drug.name, doses }));
  const review = useFieldReview();
  const ageIssue = ageError(value.ageYears);
  const weightIssue = weightError(value.weightKg);
  const windowIssue = windowError(value.tEndH);
  const medicinesIssue = value.drugs.length === 0 ? "Add a medicine to run." : null;
  const scheduleReason = value.drugs.find((line) => !line.doses.length || line.doses.some((row) =>
    doseError(row.doseMg) || doseTimeError(row.timeH, value.tEndH),
  ));
  const reason = (ageIssue ? "Check the age to run." : null)
    ?? (weightIssue ? "Check the weight to run." : null)
    ?? (windowIssue ? "Choose a valid simulation window to run." : null)
    ?? medicinesIssue
    ?? (scheduleReason ? `Complete the dose schedule for ${scheduleReason.drug.name} to run.` : null);

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
          {demo ? <SyntheticSetupNotice /> : (
            <MedicineSearch
              selectedIds={medicines.map(({ id }) => id)}
              issue={medicinesIssue}
              review={review}
              onAdd={({ drug, citations, offline }) => addDrug(drug, citations, offline)}
            />
          )}
          {!medicines.length ? (
            <button type="button" onClick={() => addDrug(exampleDrug)} className={ghostButtonClass}>
              Load synthetic example
            </button>
          ) : null}
          <MedicineChips
            medicines={medicines}
            onRemove={(id) => onChange((current) => ({ ...current, drugs: current.drugs.filter((line) => line.drug.id !== id) }))}
          />
          <div className="space-y-2">
            {value.drugs.map((line, index) => (
              <DrugCard
                key={line.drug.id}
                line={line}
                index={index}
                citations={line.citations}
                tEndH={value.tEndH}
                review={review}
                onPatch={(patch) => setDrug(index, patch)}
                onLoadScript={(doses, neededWindowH) => {
                  const tEndH = Math.max(value.tEndH, neededWindowH);
                  onChange({
                    ...value,
                    tEndH,
                    drugs: value.drugs.map((d, i) =>
                      i === index
                        ? { ...d, doses }
                        : d
                    ),
                  });
                }}
              />
            ))}
          </div>
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
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={Number.isNaN(value.ageYears) ? "" : value.ageYears}
                  onChange={(event) => set("ageYears", event.target.valueAsNumber)}
                  className={inputClass}
                  {...review.props("age", ageIssue)}
                />
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
                  value={Number.isNaN(value.weightKg) ? "" : value.weightKg}
                  onChange={(event) => set("weightKg", event.target.valueAsNumber)}
                  className={inputClass}
                  {...review.props("weight", weightIssue)}
                />
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
              onChange={(event) => set("conditionId", event.target.value)}
              className="theatre-select w-full min-w-0"
            >
              {CONDITIONS.map((condition) => (
                <option key={condition.id} value={condition.id} className="bg-surface text-ink">
                  {condition.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs leading-5 text-ink-2">Sets the walkthrough topic.</p>
            <p className="mt-1 text-xs leading-5 text-ink-2">
              {CONDITIONS.find((c) => c.id === value.conditionId)?.blurb ?? CONDITIONS[0].blurb}
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
              maxLength={400}
              placeholder="Optional notes about this fictional case"
              className={`${inputClass} resize-y leading-6`}
            />
            <p className="mt-2 text-[12px] leading-4 text-ink-3">
              Your notes are included when you save the report. Use fictional details.
            </p>
          </div>
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
              onChange={(event) => set("tEndH", Number(event.target.value))}
              className="theatre-select"
            >
              {[...new Set([12, 24, 48, 72, value.tEndH])].sort((a, b) => a - b).map((hours) => (
                <option key={hours} value={hours}>{hours} h</option>
              ))}
            </select>
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
export function Sources({ citations }: { citations?: DrugParameterCitation[] }) {
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
  line,
  index,
  tEndH,
  review,
  onPatch,
  onLoadScript,
  citations,
}: {
  line: DrugLine;
  index: number;
  tEndH: number;
  review: FieldReview;
  onPatch: (patch: Partial<DrugLine>) => void;
  /** Applies a parsed script: the parent widens the shared window if needed. */
  onLoadScript: (doses: DoseRow[], neededWindowH: number) => void;
  /** The citation behind each of this medicine's parameter values. */
  citations?: DrugParameterCitation[];
}) {
  const { drug, doses } = line;
  const [script, setScript] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** The per-drug prescription: a loader into this card's dose rows. */
  const loadScript = useCallback(() => {
    const parsed = parsePrescription(script);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    onLoadScript(parsed.doses, parsed.tEndH);
    setNote(
      `Loaded ${parsed.doses.length} dose${parsed.doses.length === 1 ? "" : "s"} for this medicine.`
    );
  }, [script, onLoadScript]);

  const range = drug.studied_dose_range_mg;
  const outsideRange = range && line.doses.some(({ doseMg }) => Number.isFinite(doseMg) && (doseMg < range[0] || doseMg > range[1]));
  const validation = VALIDATION_STATUS[drug.id];

  return (
    <div className="rounded-xl border border-line bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{drug.name}</p>
          {range ? (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
              Studied range {range[0]}–{range[1]} mg
            </p>
          ) : null}
          {validation ? <p className="text-xs text-ink-2">{validation === "failed" ? "Peak time missed the reference tolerance" : validation === "validated" ? "Measured peak and timing checked" : "No reference curve check yet"}</p> : null}
          {drug.sources[0] ? (
            <a
              href={drug.sources[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-brand-text underline"
            >
              Parameter source
            </a>
          ) : null}
        </div>
      </div>

      {outsideRange ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px] leading-4 text-warn"
        >
          A dose falls outside the range studied by the source.
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
        <p role="status" className={`mt-1.5 text-[12px] leading-4 ${note.startsWith("Loaded") ? "text-ink-2" : "text-[color:var(--manava-error)]"}`}>
          {note}
        </p>
      ) : null}

      {/* This medicine's dose rows */}
      <div className="mt-2 space-y-1.5">
        {doses.map((row, i) => (
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
              min={0}
              max={10000}
              step="any"
              value={Number.isNaN(row.doseMg) ? "" : row.doseMg}
              onChange={(event) =>
                onPatch({
                  doses: doses.map((r, j) =>
                    j === i ? { ...r, doseMg: event.target.valueAsNumber } : r
                  ),
                })
              }
              className={`${smallInputClass} w-0 min-w-0 flex-1`}
              {...review.props(`dose-${index}-${i}`, doseError(row.doseMg))}
            />
            <span className="shrink-0 font-mono text-xs text-ink-3">mg</span>
            <label className="sr-only" htmlFor={`time-${index}-${i}`}>
              {drug.name} dose {i + 1} time in hours
            </label>
            <input
              id={`time-${index}-${i}`}
              type="number"
              min={0}
              max={tEndH}
              step="any"
              value={Number.isNaN(row.timeH) ? "" : row.timeH}
              onChange={(event) =>
                onPatch({
                  doses: doses.map((r, j) =>
                    j === i ? { ...r, timeH: event.target.valueAsNumber } : r
                  ),
                })
              }
              className={`${smallInputClass} w-0 min-w-0 flex-1`}
              {...review.props(`time-${index}-${i}`, doseTimeError(row.timeH, tEndH))}
            />
            <span className="shrink-0 font-mono text-xs text-ink-3">h</span>
            {doses.length > 1 ? (
              <button
                type="button"
                onClick={() => onPatch({ doses: doses.filter((_, j) => j !== i) })}
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
        <button
          type="button"
          disabled={doses.length >= MAX_DOSES_PER_DRUG}
          onClick={() =>
            onPatch({
              doses: [
                ...doses,
                { timeH: NaN, doseMg: NaN },
              ],
            })
          }
          className={`${ghostButtonClass} mt-1 disabled:opacity-50`}
        >
          + dose
        </button>
      </div>
    </div>
  );
}
