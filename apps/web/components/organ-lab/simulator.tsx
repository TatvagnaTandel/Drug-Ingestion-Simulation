"use client";

import * as React from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import {
  simulate,
  buildReport,
  getDefaultOrganProfiles,
  type SimResult,
  type BodyProfile,
  type DoseEvent,
} from "@dib/engine";
import type { DataClient } from "@dib/data-client";
import { getBrowserDataClient } from "@/lib/browser-data-client";
import { exampleDrug, EXAMPLE_BANNER } from "@/lib/example-drug";
import TheatreNav from "@/components/theatre-nav";
import { DISCLAIMER_TEXT } from "@/components/disclaimer";
import type { BrainRegion } from "@/components/anatomy/regions";
import SimulatorConsole, { type SimulatorInput } from "./console";
import TimeDial, { type DialSource } from "./time-dial";
import BodyFigure from "./body-figure";
import KidneyReport from "./kidney-report";
import StepLiterature from "./step-literature";
import { rise } from "./motion";
import {
  conditionById,
  levelsFor,
  momentAt,
  narrate,
} from "./condition";
import type { FocusOrgan, SimulatorScene } from "./scene";
import OrganMonitor from "./organ-monitor";
import { DRUG_COLORS, SEPARATE_CURVES_CAPTION, type MedicationRun } from "@/lib/treatment";
import { getApprovedCitations, resolveCatalogueDrug } from "@/lib/catalogue";
import { STUDY_CASES, type StudyCase } from "@/lib/study-cases";
import { ageError, weightError } from "@/lib/setup-validation";
import { hasSavedSetup, persistLabSetup, useLabSetup } from "@/lib/run-setup";
import {
  compareRuns,
  SCENARIO_CONTEXT,
  scenarioById,
} from "@/lib/kidney-scenario";
import type { DrugParameterCitation } from "@dib/data-client";
import { topicForOrgan } from "@/lib/pubmed";

const toEngineSex = (s: SimulatorInput["sex"]): BodyProfile["sex"] =>
  s === "female" ? "F" : s === "male" ? "M" : "other";

const DEFAULT_INPUT: SimulatorInput = {
  conditionId: "general",
  description: "",
  ageYears: "30",
  weightKg: "70",
  sex: "",
  drugs: [],
  tEndH: 48,
  organProfiles: getDefaultOrganProfiles(),
  clearanceScenario: "baseline",
  extraFields: [],
};

/** A number box's text as a number; empty or 0 falls back to a reference adult. */
const toNumber = (text: string, fallback: number): number => {
  const value = text.trim() === "" ? 0 : Number(text);
  return Number.isFinite(value) && value !== 0 ? value : fallback;
};

/** The organ's name, for the label over the model. */
const ORGAN_LABEL: Record<FocusOrgan, string> = {
  gut: "Gut",
  heart: "Heart",
  lungs: "Lungs",
  liver: "Liver",
  kidneys: "Kidneys",
  brain: "Brain",
};

function localDrug(id: string) {
  if (id === exampleDrug.id) return exampleDrug;
  return STUDY_CASES.find((study) => study.id === id)?.input.drugs[0]?.drug;
}

type CatalogueDrug = Awaited<ReturnType<typeof resolveCatalogueDrug>>;
const EMPTY_LEVELS_TOOLTIP = "Add a medicine to see levels";

export default function Simulator() {
  /* ---- the inputs and the run ---------------------------------------- */

  const [draft, setDraft] = React.useState<SimulatorInput>(DEFAULT_INPUT);
  useLabSetup(setDraft, DEFAULT_INPUT);
  const editedSetup = React.useRef(false);
  const editSetup: React.Dispatch<React.SetStateAction<SimulatorInput>> = React.useCallback((next) => {
    editedSetup.current = true;
    setDraft(next);
  }, []);
  React.useEffect(() => {
    if (!editedSetup.current) return;
    editedSetup.current = false;
    persistLabSetup(draft);
  }, [draft]);
  const [active, setActive] = React.useState<SimulatorInput>(DEFAULT_INPUT);
  const isExample = active.drugs.some(({ drugId }) => drugId === exampleDrug.id);
  const study = STUDY_CASES.find(({ id }) => active.drugs.some(({ drugId }) => drugId === id));

  /** The hour the dial is on. */
  const [hours, setHours] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  /** Playback speed multiplier, shared with the timeline controls. */
  const [speed, setSpeed] = React.useState(1);
  /* ---- the model ------------------------------------------------------ */

  const [scene, setScene] = React.useState<SimulatorScene | null>(null);
  /** The organ the visitor is watching, in the monitor. */
  const [monitorFocus, setMonitorFocus] = React.useState<FocusOrgan | null>(null);
  const [brainRegion, setBrainRegion] = React.useState<BrainRegion | null>(null);

  /** The readout row, so a change can sweep a light across it. */
  const readoutsRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Sweeps a light across the readouts when the visitor moves the dial.
   *
   * It never runs on the play loop, which updates sixteen times a second:
   * that would be a strobe, and the numbers have to stay the engine's own.
   */
  const sweepReadouts = React.useCallback(() => {
    const element = readoutsRef.current;
    if (!element) return;
    element.classList.remove("sim-tick");
    // Force the style to be recalculated so the animation restarts.
    void element.offsetWidth;
    element.classList.add("sim-tick");
  }, []);

  /* ---- session -------------------------------------------------------- */

  const [client, setClient] = React.useState<DataClient | null>(null);
  const [signedInEmail, setSignedInEmail] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<string | null>(null);
  const [profileNotice, setProfileNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const profileLoadedRef = React.useRef(false);

  React.useEffect(() => {
    const c = getBrowserDataClient();
    if (!c) return;
    setClient(c);
    let stopped = false;
    let authChanged = false;
    const listener = c.auth.onAuthChange((_event, session) => {
      authChanged = true;
      if (!stopped) setSignedInEmail(session?.email ?? null);
    });
    void c.auth.getSession().then(({ data }) => {
      if (!stopped && !authChanged) setSignedInEmail(data?.session?.email ?? null);
    }).catch(() => {});
    return () => {
      stopped = true;
      listener.data?.unsubscribe();
    };
  }, []);

  // Prefill untouched profile values only, once, for a signed-in visitor.
  React.useEffect(() => {
    if (!client || !signedInEmail || profileLoadedRef.current || hasSavedSetup("lab")) return;
    let stopped = false;
    void client.profile.getProfile().then(({ data, error }) => {
      if (stopped || error || !data) return;
      profileLoadedRef.current = true;
      setDraft((d) => hasSavedSetup("lab") || d.importedPdf || d.ageYears !== DEFAULT_INPUT.ageYears ||
        d.weightKg !== DEFAULT_INPUT.weightKg || d.sex !== DEFAULT_INPUT.sex || d.drugs.length
        ? d
        : { ...d, ageYears: String(data.ageYears), weightKg: String(data.weightKg), sex: data.sex });
    }).catch(() => {});
    return () => { stopped = true; };
  }, [client, signedInEmail]);

  /* ---- the engine ----------------------------------------------------- */

  const [catalogueDrugs, setCatalogueDrugs] = React.useState<Map<string, CatalogueDrug>>(new Map());
  React.useEffect(() => {
    let cancelled = false;
    const sourced = active.drugs.filter(({ drugId }) => !localDrug(drugId));
    void Promise.all(sourced.map(async ({ drugId, name, offline }) => {
      try {
        return [drugId, await resolveCatalogueDrug(drugId, name, offline)] as const;
      } catch {
        return [drugId, null] as const;
      }
    })).then((rows) => {
      if (!cancelled) setCatalogueDrugs(new Map(rows));
    });
    return () => { cancelled = true; };
  }, [active]);

  /**
   * The citation behind each value of each medicine's parameters. This is what
   * the console shows under a medicine, so a number can always be traced to the
   * document that states it.
   */
  const [citations, setCitations] = React.useState<Map<string, DrugParameterCitation[]>>(
    new Map()
  );
  React.useEffect(() => {
    let cancelled = false;
    // The console edits a draft treatment and the run uses an active one, so
    // both are covered: a medicine's sources have to be there while it is
    // being added, not only after the simulation is run.
    for (const drug of draft.drugs) {
      if (localDrug(drug.drugId) || drug.offline || citations.has(drug.drugId)) continue;
      getApprovedCitations(drug.drugId)
        .then((list) => {
          if (cancelled || !list || list === "error" || list === "unconfigured") return;
          setCitations((prev) => new Map(prev).set(drug.drugId, list));
        })
        .catch(() => {
          /* the parameters still run; only the sources line is missing */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [draft.drugs, citations]);

  const condition = conditionById(active.conditionId);
  /** The treatment's medicines for the strips — memoised so the strip's
   * effect does not re-run (and cancel its fetches) on every re-render. */
  const stripDrugs = React.useMemo(
    () => active.drugs.filter(({ drugId }) => drugId !== exampleDrug.id).map((d) => ({ id: d.drugId, name: d.name })),
    [active.drugs],
  );

  const { runs, healthyRuns, simError } = React.useMemo((): {
    runs: MedicationRun[] | null;
    healthyRuns: MedicationRun[] | null;
    simError: string | null;
  } => {
    const empty = { runs: null, healthyRuns: null, simError: null };
    if (active.drugs.length === 0) return empty;
    const sourced = active.drugs.filter(({ drugId }) => !localDrug(drugId));
    if (sourced.some(({ drugId }) => catalogueDrugs.get(drugId) === null)) {
      return { ...empty, simError: "Approved pharmacokinetics could not be loaded. Try running again." };
    }
    if (sourced.some(({ drugId }) => !catalogueDrugs.has(drugId))) return empty;

    const ageYears = toNumber(active.ageYears, 30);
    const weightKg = toNumber(active.weightKg, 70);
    const profile: BodyProfile = {
      ageYears,
      weightKg,
      sex: toEngineSex(active.sex),
      organProfiles: active.organProfiles,
    };
    // The healthy reference keeps every input the same except the organ
    // archetypes — those become the healthy adult defaults.
    const healthyProfile: BodyProfile = {
      ...profile,
      organProfiles: getDefaultOrganProfiles(),
    };
    try {
      const out: MedicationRun[] = [];
      const healthy: MedicationRun[] = [];
      for (const [index, line] of active.drugs.entries()) {
        const drug = localDrug(line.drugId) ?? catalogueDrugs.get(line.drugId)?.drug;
        if (!drug) throw new Error(`Approved parameters are unavailable for ${line.name}.`);
        const doses: DoseEvent[] = line.doses.map((r) => ({
          drugId: line.drugId,
          doseMg: Number(r.doseMg) || 0,
          timeH: Number(r.timeH) || 0,
        }));
        const runArgs = { doses, tEndH: active.tEndH, dtH: 0.05 };
        const baseline = simulate({ ...runArgs, profile, drug });
        const result =
          active.clearanceScenario === "baseline"
            ? baseline
            : simulate({
                ...runArgs,
                profile,
                drug,
                clearanceMultiplier: scenarioById(active.clearanceScenario).multiplier,
              });
        out.push({
          id: line.drugId,
          name: line.name,
          color: DRUG_COLORS[index % DRUG_COLORS.length],
          result,
          ...(active.clearanceScenario === "baseline" ? {} : { baseline }),
        });
        // The reference is always the cited, unscaled run on healthy organs.
        healthy.push({
          id: line.drugId,
          name: line.name,
          color: DRUG_COLORS[index % DRUG_COLORS.length],
          result: simulate({ ...runArgs, profile: healthyProfile, drug }),
        });
      }
      return {
        runs: out.length > 0 ? out : null,
        healthyRuns: healthy.length > 0 ? healthy : null,
        simError: null,
      };
    } catch (e) {
      return { runs: null, healthyRuns: null, simError: e instanceof Error ? e.message : "simulation failed" };
    }
  }, [active, catalogueDrugs]);

  const single = runs?.length === 1 ? runs[0] : null;
  const hasRun = Boolean(runs?.length);
  const canSaveReport = hasRun && !active.importedPdf && !active.drugs.some(
    ({ drugId }) => localDrug(drugId) || catalogueDrugs.get(drugId)?.offline,
  );
  /** One engine summary per medicine — never one combined summary. */
  const reports = React.useMemo(
    () => (runs ?? []).map((r) => ({ run: r, report: buildReport(r.result) })),
    [runs]
  );

  const firstFailure = React.useMemo(() => {
    const failures = (runs ?? []).flatMap(({ name, result }) => {
      const event = result.toxicity?.death;
      return event ? [{ ...event, drugName: name }] : [];
    });
    return failures.sort((a, b) => a.timeH - b.timeH)[0] ?? null;
  }, [runs]);
  const death = firstFailure && hours >= firstFailure.timeH ? firstFailure : null;
  const failureMessage = death
    ? `Teaching model threshold reached at ${death.timeH.toFixed(2)} h for ${death.drugName} (${death.organ}).`
    : null;

  React.useEffect(() => {
    if (death) setPlaying(false);
  }, [death]);

  /** The treatment's name for the header and the report title. */
  const treatmentLabel = React.useMemo(() => {
    if (active.drugs.length === 0) return "No medicine added";
    if (active.drugs.length === 1) return active.drugs[0].name;
    return `${active.drugs.length} medicines — modelled separately`;
  }, [active.drugs]);

  /** The engine's numbers at the hour the dial is on, per medicine. */
  const breakdown = React.useMemo(
    () =>
      (runs ?? []).map((r) => ({
        name: r.name,
        color: r.color,
        moment: momentAt(
          r.result.tH,
          r.result.gutMg,
          r.result.bodyMg,
          r.result.concMgPerL,
          r.result.eliminationMgPerH,
          hours
        ),
      })),
    [runs, hours]
  );

  const moment = breakdown[0]?.moment ?? {
    hours: 0,
    gutMg: 0,
    bodyMg: 0,
    concMgPerL: 0,
    eliminationMgPerH: 0,
  };

  /**
   * The peak of each quantity, per medicine, over the whole run.
   *
   * The organ fill is normalised against the strongest mover among the
   * treatment's medicines; each medicine is still drawn against its own kind
   * of quantity.
   */
  const peaks = React.useMemo(() => {
    const empty = { concMgPerL: 0, eliminationMgPerH: 0 };
    if (!runs || runs.length === 0) return empty;
    const peakOf = (values: number[]) => values.reduce((max, v) => (v > max ? v : max), 0);
    return {
      concMgPerL: Math.max(...runs.map((r) => peakOf(r.result.concMgPerL))),
      eliminationMgPerH: Math.max(...runs.map((r) => peakOf(r.result.eliminationMgPerH))),
    };
  }, [runs]);

  /** The strongest mover among the medicines holds each organ's fill. */
  const levelsFrom = (
    pieces: Array<{ moment: ReturnType<typeof momentAt> }>,
    scale: { concMgPerL: number; eliminationMgPerH: number }
  ): Record<string, number> => {
    if (pieces.length === 0) return levelsFor(moment, scale);
    const per = pieces.map((p) => levelsFor(p.moment, scale));
    return Object.fromEntries(
      Object.keys(per[0]).map((key) => [key, Math.max(...per.map((l) => l[key] ?? 0))])
    ) as Record<string, number>;
  };

  const levels = React.useMemo(
    () => levelsFrom(breakdown, peaks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdown, peaks, moment]
  );

  const focusOrgan = monitorFocus;

  React.useEffect(() => {
    scene?.focusOrgan(focusOrgan);
    scene?.setFocus(focusOrgan);
  }, [scene, focusOrgan]);

  React.useEffect(() => {
    scene?.setIsolation(monitorFocus);
  }, [scene, monitorFocus]);

  React.useEffect(() => {
    scene?.setLevels(levels);
  }, [scene, levels]);

  React.useEffect(() => {
    scene?.setDead(Boolean(death));
  }, [scene, death]);

  /** The small readout shown when the pointer rests on an organ in the model. */
  const hoverDataFor = React.useCallback(
    (organ: FocusOrgan) => {
      const title = ORGAN_LABEL[organ];
      if (!hasRun) return { title, lines: [EMPTY_LEVELS_TOOLTIP] };
      const toxic = runs?.[0]?.result.toxicity;
      const loadKey = organ as keyof NonNullable<typeof toxic>["organLoad"];
      const load = toxic?.organLoad[loadKey];
      return {
        title,
        lines: [
          `Relative level: ${((levels[organ] ?? 0) * 100).toFixed(0)}% of peak`,
          `Model time: T+${hours.toFixed(1)} h`,
          ...(load !== undefined ? [`Peak teaching load: ${load.toFixed(2)}×`] : []),
          ...(toxic?.failedOrgans.some((f) => f.organ === loadKey && f.timeH <= hours)
            ? ["Teaching model threshold reached"] : []),
        ],
      };
    },
    [levels, hours, runs, hasRun]
  );

  // The dial is clamped to the window of the run it belongs to.
  React.useEffect(() => {
    setHours((h) => Math.min(h, active.tEndH));
  }, [active.tEndH]);

  /** The dial moved. A visitor's move is swept; the play loop is not. */
  const handleHours = React.useCallback(
    (next: number, source: DialSource) => {
      if (!hasRun) return;
      setHours(Math.min(next, firstFailure?.timeH ?? active.tEndH));
      if (source === "user") sweepReadouts();
    },
    [active.tEndH, firstFailure, hasRun, sweepReadouts]
  );

  // Play: the dial advances on its own and loops. Speed is shared with the
  // timeline bar; the play loop never runs once the model has failed.
  React.useEffect(() => {
    if (!playing || !hasRun || death) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setHours((h) => {
        const step = Math.max(0.05, active.tEndH / 240) * speed;
        const next = h + step;
        if (firstFailure && next >= firstFailure.timeH) return firstFailure.timeH;
        return next > active.tEndH ? 0 : next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [playing, hasRun, active.tEndH, speed, death, firstFailure]);

  /* ---- running and saving --------------------------------------------- */

  function start(input: SimulatorInput, custom = false) {
    if (custom) persistLabSetup(input);
    setCatalogueDrugs(new Map());
    setDraft(input);
    setActive({ ...input });
    setHours(0);
    setMonitorFocus(null);
    setPlaying(custom);
    setAction(null);
    setProfileNotice(null);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  function runStudy({ input, references }: StudyCase) {
    start({
      ...DEFAULT_INPUT,
      conditionId: input.conditionId,
      description: input.description,
      ageYears: String(input.ageYears),
      weightKg: String(input.weightKg),
      tEndH: input.tEndH,
      drugs: input.drugs.map(({ drug, doses }) => ({
        drugId: drug.id,
        name: drug.name,
        doses: doses.map(({ doseMg, timeH }) => ({ doseMg: String(doseMg), timeH: String(timeH) })),
        doseRange: drug.studied_dose_range_mg,
        hasPk: true,
        sourceUrl: references[0]?.url,
      })),
    });
  }

  function runExample() {
    start({
      ...DEFAULT_INPUT,
      conditionId: "kidney",
      ageYears: "30",
      weightKg: "70",
      clearanceScenario: "reduced",
      organProfiles: { ...getDefaultOrganProfiles(), kidneyId: "kidney_ckd_stage3_hypertensive" },
      drugs: [{
        drugId: exampleDrug.id,
        name: exampleDrug.name,
        doses: [{ doseMg: "100", timeH: "0" }],
        doseRange: null,
        hasPk: true,
      }],
    });
  }

  const saveReport = React.useCallback(async () => {
    if (!client || !signedInEmail || !canSaveReport || reports.length === 0 || saving) return;
    setSaving(true);
    setAction(null);

    // One entry per (medicine, amount), each carrying every time that
    // amount was given.
    const drugs = active.drugs.flatMap((line) => {
      const byAmount = new Map<number, number[]>();
      for (const r of line.doses) {
        const amount = Number(r.doseMg) || 0;
        const time = Number(r.timeH) || 0;
        const times = byAmount.get(amount) ?? [];
        times.push(time);
        byAmount.set(amount, times);
      }
      return [...byAmount.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([doseMg, times]) => ({
          drugId: line.drugId,
          doseMg,
          times: times.sort((a, b) => a - b),
        }));
    });

    const scenario = scenarioById(active.clearanceScenario);
    const scenarioLine =
      active.clearanceScenario === "baseline"
        ? "Model setting: no extra clearance scaling. Selected organ profiles still apply."
        : `Model what-if: ${scenario.label} (clearance x${scenario.multiplier}). ${SCENARIO_CONTEXT}`;

    const perMedicine = reports.map(({ run, report }) => {
      const comparison = run.baseline
        ? ` What-if vs same organ profiles without extra clearance scaling: ${compareRuns(run.result, run.baseline)
            .map((row) => `${row.label} ${row.baseline} -> ${row.scenario}`)
            .join("; ")}.`
        : "";
      return `${run.name}: ${report.bullets.join("; ")}${comparison}`;
    });
    const summaryText = [
      scenarioLine,
      reports.length > 1
        ? "Each medicine is modelled separately on its own approved row. Interactions are not modelled."
        : "Parameters sourced from the approved, cited PK row.",
      active.description.trim() ? `Case: ${active.description.trim().slice(0, 400)}` : "",
      ...perMedicine,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1000);

    // The report schema carries one metrics object; it is the first
    // medicine's, and the summary names it — the panel never sums.
    const first = reports[0].run.result;

    try {
      const { error } = await client.reports.saveReport({
        title: `${treatmentLabel} — ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
        profileSnapshot: {
          ageYears: toNumber(active.ageYears, 30),
          weightKg: toNumber(active.weightKg, 70),
          sex: active.sex || "other",
        },
        drugs,
        metrics: {
          cmaxMgPerL: first.cmaxMgPerL,
          tmaxH: first.tmaxH,
          timeToClearH: first.timeToClearH,
          modelScenario: { id: scenario.id, clearanceMultiplier: scenario.multiplier },
        },
        // No verified interaction pairs exist yet. Sending [] is the honest value.
        warnings: [],
        summary: summaryText,
        summarySource: "template",
        engineVersion: "0.1.0",
      });
      setAction(error ? `Save failed: ${error.message}` : "Report saved to your account.");
    } catch {
      setAction("The report could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }, [active, client, canSaveReport, reports, saving, signedInEmail, treatmentLabel]);

  const saveProfile = React.useCallback(async () => {
    if (!client || !signedInEmail || draft.importedPdf || draft.drugs.some(({ drugId }) => localDrug(drugId))) return;
    const issue = ageError(draft.ageYears) ?? weightError(draft.weightKg);
    if (issue) {
      setProfileNotice(issue);
      return;
    }
    setProfileNotice(null);
    try {
      const { error } = await client.profile.saveProfile({
        ageYears: Number(draft.ageYears),
        weightKg: Number(draft.weightKg),
        sex: draft.sex || "other",
      });
      setProfileNotice(error ? `Profile save failed: ${error.message}` : "Profile saved to your account.");
    } catch {
      setProfileNotice("The profile could not be saved. Try again.");
    }
  }, [client, draft, signedInEmail]);

  /* ---- render ---------------------------------------------------------- */

  return (
    <div className="organ-lab relative z-[2] text-ink">
      <TheatreNav />
      <main id="main" tabIndex={-1}>
      <header className="lab-header">
        <div>
          <h1 className="lab-heading text-ink">Organ Lab</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
            Inspect organs in any order and compare their illustrative readings at the time you choose.
          </p>
          <p className="mt-2 text-xs text-ink-3">{DISCLAIMER_TEXT}</p>
          {isExample ? <p className="theatre-chip mt-3">Fictional example · {EXAMPLE_BANNER}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="theatre-button theatre-primary" onClick={runExample}>
            Run synthetic example
          </button>
          {STUDY_CASES.map((example) => (
            <button className="theatre-button" key={example.id} type="button" onClick={() => runStudy(example)}>
              Try {example.input.drugs[0].drug.name.toLowerCase()}
            </button>
          ))}
        </div>
      </header>

      <div className="lab-layout relative mx-auto grid w-full gap-5 px-4 pb-24 pt-5">
        {/* ---- the model, in the middle ---- */}
        <section
          aria-label="The anatomy"
          className="lab-anatomy sim-rise flex min-w-0 flex-col gap-3"
          style={rise(80)}
        >
          {/* The timeline sits at the top of the model, small and always in reach. */}
          <div className="sim-rise relative z-20 rounded-[10px] border border-line bg-surface/60 px-2.5 py-1.5" style={rise(40)}>
            <TimeDial
              maxH={active.tEndH}
              hours={hours}
              onHours={handleHours}
              playing={playing && hasRun}
              onTogglePlay={() => {
                if (!hasRun) return;
                if (death) setHours(0);
                if (!death || death.timeH > 0) setPlaying((p) => !p);
              }}
              speed={speed}
              onSpeedChange={setSpeed}
              tmaxH={single ? single.result.tmaxH : null}
              disabled={!hasRun}
              disabledReason={active.drugs.length ? simError ?? "Loading medicine parameters" : EMPTY_LEVELS_TOOLTIP}
            />
          </div>

          <label className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
            <span>Anatomy view</span>
            <select
              className="theatre-select"
              value={focusOrgan ?? ""}
              onChange={(event) => {
                const selected = Object.keys(ORGAN_LABEL).find((organ) => organ === event.currentTarget.value);
                setMonitorFocus(selected ? selected as FocusOrgan : null);
              }}
            >
              <option value="">Whole body</option>
              {Object.entries(ORGAN_LABEL).map(([organ, label]) => <option value={organ} key={organ}>{label}</option>)}
            </select>
          </label>

          <div className="lab-viewport relative overflow-hidden rounded-[12px] border border-line">
            <BodyFigure
              scene={scene}
              focus={focusOrgan}
              focusLabel={focusOrgan ? ORGAN_LABEL[focusOrgan] : null}
              onScene={setScene}
              onBrainRegion={setBrainRegion}
              organData={hoverDataFor}
              dead={Boolean(death)}
              deathMessage={failureMessage}
            />
          </div>
          <div className="theatre-anatomy-key" aria-label="Anatomy colors">
            <span data-color="circulation">Blue · Circulation</span><span data-color="inactive">Dim · Inactive anatomy</span>
          </div>

          {/* The readouts: the engine's numbers at the dial's hour. */}
          <div
            ref={readoutsRef}
            className="sim-rise overflow-hidden rounded-[10px] border border-line bg-line"
            style={rise(260)}
          >
            <div className="flex items-center justify-between bg-surface/80 px-3 py-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">
                Model values
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
                Per medicine
              </span>
            </div>
            {hasRun ? <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-line/60">
                    {["Medicine", "Concentration", "In the gut", "In the blood", "Clearing"].map((h) => (
                      <th
                        key={h}
                        className="bg-surface/80 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] font-normal text-ink-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((run) => {
                    const b = breakdown.find((x) => x.name === run.name);
                    if (!b) return null;
                    const m = b.moment;
                    return (
                      <tr key={run.id} className="border-b border-line/40 last:border-b-0">
                        <td className="bg-surface/80 px-3 py-1.5 text-[13px] text-ink">
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ background: run.color }}
                            aria-hidden="true"
                          />
                          {run.name}
                        </td>
                        {[
                          `${m.concMgPerL.toFixed(3)} mg/L`,
                          `${m.gutMg.toFixed(1)} mg`,
                          `${m.bodyMg.toFixed(1)} mg`,
                          `${m.eliminationMgPerH.toFixed(2)} mg/h`,
                        ].map((v, i) => (
                          <td
                            key={i}
                            className="bg-surface/80 px-3 py-1.5 font-mono text-[13px] tabular-nums text-brand-text"
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div> : (
              <div className="flex flex-wrap items-center gap-2 bg-surface/80 px-3 py-3">
                <p role="status" className="basis-full text-sm text-ink-2">
                  {simError ?? (active.drugs.length ? "Loading medicine parameters…" : "Add a medicine to see levels, or start with a published study.")}
                </p>
              </div>
            )}
            {hasRun ? <p className="border-t border-line/60 bg-surface/80 px-3 py-1.5 text-xs leading-4 text-warn">
              {SEPARATE_CURVES_CAPTION}
            </p> : null}
            {study ? (
              <ul aria-label="Study sources" className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line bg-surface px-3 py-2 text-xs">
                {study.references.map(({ label, url }) => (
                  <li key={url}><a className="text-brand-text underline underline-offset-2" href={url} target="_blank" rel="noreferrer">{label}</a></li>
                ))}
              </ul>
            ) : null}
          </div>


          {brainRegion ? (
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-2">
              Pointer on {brainRegion.display} — {brainRegion.part}
            </p>
          ) : null}
        </section>

        {/* ---- the inputs ---- */}
        <aside
          aria-label="Simulation inputs"
          className="lab-inputs sim-rise min-w-0"
          style={rise(0)}
        >
          <div className="rounded-[12px] border border-line bg-surface/70 p-4">
            <h2 className="mb-4 font-heading text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-2">
              Inputs
            </h2>
            <SimulatorConsole
              value={draft}
              onChange={editSetup}
              onSubmit={() => start(draft, true)}
              error={simError}
              citations={citations}
              actions={client && signedInEmail ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveReport()}
                    disabled={saving || !canSaveReport} aria-busy={saving}
                    className="theatre-button"
                  >
                    <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                    {saving ? "Saving…" : "Save report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={draft.importedPdf || draft.drugs.some(({ drugId }) => localDrug(drugId))}
                    className="theatre-button"
                  >
                    Save profile
                  </button>
                </>
              ) : (
                <p className="text-[13px] text-ink-3">
                  <Link href="/signin" className="underline hover:text-brand-text">
                    Sign in
                  </Link>{" "}
                  to save reports.
                </p>
              )}
            />

            {profileNotice ? <p role="status" className="theatre-toast mt-3 text-sm">{profileNotice}</p> : null}
            {active.importedPdf || draft.importedPdf ? (
              <p className="mt-3 text-xs text-ink-3">Drafts and runs with imported values stay in this browser.</p>
            ) : null}
            {action ? (
              <p role="status" className="theatre-toast mt-3 text-sm">
                {action}
              </p>
            ) : null}
          </div>
        </aside>

      {/* ---- the graphs and the written experiment, below the 3D model ---- */}
      <section
        aria-label="Experiment graphs and details"
        className="lab-experiment relative min-w-0"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3 border-t border-line pt-5">
          <h2 className="font-heading text-[15px] font-semibold uppercase tracking-[0.18em] text-ink">
            Experiment — graphs and details
          </h2>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
            Scroll to explore
          </p>
        </div>

        <div className="grid gap-6">
          {/* The healthy reference stays as a graph, beside this model's curves. */}
          <div
            id="experiment-graphs"
            className="h-fit overflow-hidden rounded-[10px] border border-line bg-surface/40"
          >
            <OrganMonitor
              runs={runs}
              healthyRuns={healthyRuns}
              hours={hours}
              focus={monitorFocus}
              onToggleFocus={(organ) => setMonitorFocus(organ)}
              organProfiles={active.organProfiles}
              dead={Boolean(death)}
            />
          </div>

          {/* Live body status, the narrated walkthrough and engine summaries. */}
          <div>
          <h2 className="sr-only">Organ details</h2>

          <section
            aria-label="Current body status"
            className="mb-6 rounded-[10px] border border-line bg-surface/50 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">
                Illustrative model status
              </p>
              <p className="font-mono text-xs tabular-nums text-brand-text">
                T+{hours.toFixed(1)} h
              </p>
            </div>
            {death ? (
              <p role="alert" className="mt-2 rounded-[6px] border border-rose-500/50 bg-rose-500/10 px-2.5 py-2 text-[12px] leading-5 text-[color:var(--manava-error)]">
                {failureMessage}
              </p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: "Concentration", value: `${moment.concMgPerL.toFixed(3)} mg/L` },
                { label: "In the gut", value: `${moment.gutMg.toFixed(1)} mg` },
                { label: "In the blood", value: `${moment.bodyMg.toFixed(1)} mg` },
                { label: "Clearing", value: `${moment.eliminationMgPerH.toFixed(2)} mg/h` },
              ].map((item) => (
                <div key={item.label} className="rounded-[8px] border border-line bg-page/50 px-2.5 py-2">
                  <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-[14px] tabular-nums text-brand-text">
                    {hasRun ? item.value : "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {breakdown.length > 1 ? (
              <p className="mt-2 text-xs leading-4 text-ink-3">
                {breakdown.map((b) => b.name).join(" · ")} — each medicine is modelled separately.
              </p>
            ) : null}

            {/* Selecting an organ in the monitor shows its data beside this panel. */}
            {monitorFocus ? (
              <div className="mt-3 rounded-[8px] border border-brand/40 bg-brand/5 px-2.5 py-2">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-text">
                  Selected organ · {ORGAN_LABEL[monitorFocus]}
                </p>
                <p className="mt-1 font-mono text-[12px] tabular-nums text-ink">
                  {hoverDataFor(monitorFocus).lines.join(" · ")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const graph = document.getElementById("experiment-graphs");
                    if (!graph) return;
                    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    graph.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                  }}
                  className="mt-1.5 font-mono text-xs uppercase tracking-[0.12em] text-brand-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  See its graph beside the healthy reference →
                </button>
              </div>
            ) : null}
          </section>

          {hasRun ? (() => {
            const narration = narrate(focusOrgan, moment, condition, breakdown);
            return (
              <article className="theatre-card p-5">
                <h3 className="font-heading text-xl text-ink">{narration.title}</h3>
                <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-ink-2">
                  {narration.body}
                </p>

                {narration.groups ? (
                  <div className="mt-5 space-y-4">
                    {narration.groups.map((group) => (
                      <div key={group.name}>
                        <p className="mb-1.5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-ink-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: group.color }}
                            aria-hidden="true"
                          />
                          {group.name}
                        </p>
                        <dl className="grid max-w-[46ch] grid-cols-2 gap-2">
                          {group.figures.map((figure) => (
                            <div
                              key={figure.label}
                              className="theatre-stat"
                            >
                              <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
                                {figure.label}
                              </dt>
                              <dd className="mt-0.5 font-mono text-[15px] tabular-nums text-brand-text">
                                {figure.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : null}
                <dl className={`${narration.groups ? "hidden" : "mt-5 grid max-w-[46ch] grid-cols-2 gap-2"}`}>
                  {narration.figures.map((figure) => (
                    <div
                      key={figure.label}
                      className="theatre-stat"
                    >
                      <dt className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
                        {figure.label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-[15px] tabular-nums text-brand-text">
                        {figure.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Published papers about the process this step narrates. */}
                <StepLiterature
                  topic={topicForOrgan(focusOrgan)}
                  drugs={stripDrugs}
                />
              </article>
            );
          })() : null}

          {runs ? <KidneyReport scenario={active.clearanceScenario} runs={runs} drugs={stripDrugs} /> : null}

          {/* One engine summary per medicine — never a shared summary. */}
          {reports.map(({ run, report }: { run: MedicationRun; report: { bullets: string[]; disclaimer: string } }) => (
            <article
              key={run.id}
              className="theatre-card p-5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: run.color }}
                  aria-hidden="true"
                />
                <h3 className="font-heading text-[19px] font-semibold leading-7 tracking-tight text-ink">
                  The engine&rsquo;s summary — {run.name}
                </h3>
              </div>
              <ul className="mt-3 space-y-1.5">
                {report.bullets.map((bullet: string) => (
                  <li key={bullet} className="max-w-[46ch] font-mono text-[13px] leading-6 text-ink-2">
                    {bullet}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-[46ch] text-[12px] leading-5 text-ink-3">
                {report.disclaimer}
              </p>
            </article>
          ))}
          </div>
        </div>
      </section>
      </div>
      </main>
    </div>
  );
}
