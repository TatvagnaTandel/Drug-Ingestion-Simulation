"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RotateCcw } from "lucide-react";
import { SEPARATE_CURVES_CAPTION } from "@/lib/treatment";
import { Sources } from "./console";
import {
  CHECKPOINT_COLUMNS, ELIMINATION_NOTE, RESULT_FORMULAS, SERIES_LABELS, chartData,
  checkpointRows, parameterRows, reportDisclaimers, reportMetrics, type ReportData, type Series,
} from "./report-data";
import { serializeTimeSeries } from "./report-csv";
import { readMoment, timeLabel } from "./playback";

type Pdf = {
  url: string | null;
  filename: string;
  error: boolean;
  retry: () => void;
};

export function useReportPdf(data: Omit<ReportData, "runs" | "primaryRun"> & {
  runs: ReportData["runs"] | null;
  primaryRun: ReportData["primaryRun"] | undefined;
}): Pdf {
  const { active, runs, primaryRun, stages, study, isExample, treatmentLabel } = data;
  const [pdf, setPdf] = useState<{ runs: typeof runs; url: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const slug = treatmentLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "simulation";

  useEffect(() => {
    if (!runs || !primaryRun) return;
    let cancelled = false;
    let url: string | null = null;
    void import("./report-pdf")
      .then(({ generateReportPdf }) => {
        if (cancelled) return;
        url = URL.createObjectURL(generateReportPdf({ active, runs, primaryRun, stages, study, isExample, treatmentLabel }));
        setPdf({ runs, url });
      })
      .catch(() => { if (!cancelled) setPdf({ runs, url: null }); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [active, attempt, isExample, primaryRun, runs, stages, study, treatmentLabel]);

  const current = pdf?.runs === runs ? pdf : null;
  return useMemo(() => ({
    url: current?.url ?? null,
    filename: `dib-${slug}-report.pdf`,
    error: current !== null && current.url === null,
    retry: () => { setPdf(null); setAttempt((value) => value + 1); },
  }), [current, slug]);
}

export function ModelChart({ runs, hours, metric = "concMgPerL" }: Pick<ReportData, "runs"> & {
  hours?: number;
  metric?: Series;
}) {
  const { duration, max, series } = useMemo(() => {
    const data = chartData(runs, metric);
    return {
      ...data,
      series: data.series.map(({ points, ...line }) => ({
        ...line,
        path: points.map(([x, y]) => `${(x * 640).toFixed(2)},${(y * 150).toFixed(2)}`).join(" "),
      })),
    };
  }, [runs, metric]);
  const [hover, setHover] = useState<number | null>(null);
  const cursor = hours === undefined ? null : 640 * Math.min(1, Math.max(0, hours / duration));
  const readings = hours === undefined ? [] : runs.map(({ id, name, color, result }) => ({
    id, name, color, value: readMoment(result, hours)[metric],
  }));
  const crosshair = hover === null ? null : 640 * hover / duration;
  const unit = metric === "gutMg" ? "mg" : metric === "eliminationMgPerH" ? "mg/h" : "mg/L";
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink">
        <span>{SERIES_LABELS[metric]}</span>
        {hours !== undefined ? <span hidden data-curve-time>{timeLabel(hours)}</span> : metric === "concMgPerL" ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-ink-2" aria-label="Shared by Heart, Lungs, Brain">
            Shared by {["Heart", "Lungs", "Brain"].map((organ) => (
              <span key={organ} className="rounded-full border border-line px-2 py-0.5">{organ}</span>
            ))}
          </span>
        ) : null}
      </figcaption>
      <div className="grid grid-cols-[minmax(2rem,auto)_minmax(0,1fr)] gap-x-2 font-mono text-xs text-ink-3">
        <div aria-hidden="true" className="flex flex-col items-end justify-between tabular-nums">
          <span>{max.toPrecision(3)}</span><span>{(max / 2).toPrecision(3)}</span><span>0</span>
        </div>
        <svg viewBox="0 -2 640 154" preserveAspectRatio="none"
          className="concentration-plot w-full overflow-visible border-b border-l border-line-strong"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setHover(duration * Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
          }}
          onPointerLeave={() => setHover(null)}
          role="img" aria-label={`${SERIES_LABELS[metric]} over time for ${series.map(({ name }) => name).join(", ")}`}>
          {cursor !== null ? <rect x={0} y={0} width={cursor} height={150} fill="var(--peach)" opacity={.08} /> : null}
          <path d="M0 0H640M0 75H640" className="stroke-line" strokeDasharray="5 5" fill="none" />
          {series.map(({ id, path, color }) => (
            <polyline key={id} points={path} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
          ))}
          {metric === "concMgPerL" ? runs.map(({ id, name, color, result }) => (
            <circle key={id} cx={640 * result.tmaxH / duration} cy={150 * (1 - result.cmaxMgPerL / max)} r={4} fill={color}>
              <title>{`${name} peak ${result.cmaxMgPerL.toFixed(3)} mg/L ${timeLabel(result.tmaxH)}`}</title>
            </circle>
          )) : null}
          {crosshair === null ? null : <path d={`M${crosshair} 0V150`} stroke="currentColor" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
          {cursor === null ? null : (
            <>
              <path d={`M${cursor} 0V150`} stroke="var(--theatre-amber, #ffc18a)" vectorEffect="non-scaling-stroke" />
              {readings.map(({ id, color, value }) => (
                <circle key={id} cx={cursor} cy={150 * (1 - value / max)} r={3.5} fill={color} vectorEffect="non-scaling-stroke" />
              ))}
            </>
          )}
        </svg>
        <div className="col-start-2 flex justify-between pt-1 tabular-nums" aria-hidden="true">
          <span>0 h</span><span>{duration / 2} h</span><span>{duration} h</span>
        </div>
        <span className="col-start-2 text-center">Simulated time (h)</span>
      </div>
      {hover !== null ? <p className="mt-2 text-xs font-mono text-ink-2">Chart cursor {timeLabel(hover)} · {runs.map(({ name, result }) => `${name} ${readMoment(result, hover)[metric].toFixed(3)} ${unit}`).join(" · ")}</p> : null}
      {hours !== undefined ? (
        <ul className="mt-3 space-y-1 text-xs" data-curve-readings>
          {readings.map(({ id, name, color, value }) => (
            <li key={id} className="flex flex-wrap justify-between gap-x-2">
              <span><span className="mr-1 inline-block size-2 rounded-full" style={{ background: color }} />{name}</span>
              <span className="font-mono">{value.toFixed(3)} {unit}</span>
            </li>
          ))}
        </ul>
      ) : series.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {series.map(({ id, name, color }) => (
            <li key={id} className="flex items-center gap-2"><span className="h-0.5 w-4" style={{ background: color }} />{name}</li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

export function PdfAction({ pdf, onDownload }: { pdf: Pdf; onDownload?: () => void }) {
  if (pdf.url) {
    return <a href={pdf.url} download={pdf.filename} onClick={onDownload} className="theatre-button theatre-primary"><Download className="size-4" aria-hidden="true" /> Download PDF</a>;
  }
  if (pdf.error) {
    return <button type="button" onClick={pdf.retry} className="theatre-button">Retry PDF</button>;
  }
  return <span role="status" aria-busy="true" className="theatre-skeleton text-sm text-ink-2">Preparing PDF…</span>;
}

function CsvAction({ runs, filename, onDownload }: Pick<ReportData, "runs"> & { filename: string; onDownload: () => void }) {
  const [file, setFile] = useState<{ runs: typeof runs; url: string } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([serializeTimeSeries(runs)], { type: "text/csv;charset=utf-8" }));
    setFile({ runs, url });
    return () => URL.revokeObjectURL(url);
  }, [runs]);
  const href = file?.runs === runs ? file.url : undefined;
  return href ? (
    <a href={href} download={filename} onClick={onDownload} className="theatre-button"><Download className="size-4" aria-hidden="true" /> Download CSV</a>
  ) : <span role="status" aria-busy="true" className="theatre-skeleton text-sm text-ink-2">Preparing CSV…</span>;
}

const RunResults = memo(function RunResults({ pdf, onReplay, ...data }: ReportData & { pdf: Pdf; onReplay: () => void }) {
  const { active, runs, primaryRun, study, treatmentLabel } = data;
  const [feedback, setFeedback] = useState("");
  const rows = parameterRows(data);
  const warnings = [...new Set(runs.flatMap(({ name, result }) => result.warnings.map((warning) => `${name}: ${warning}`)))];
  return (
    <section id="simulation-results" aria-labelledby="results-title" className="theatre-surface results-panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="theatre-eyebrow">{treatmentLabel} · {active.tEndH} h</p>
          <h2 id="results-title" className="mt-1 font-heading text-4xl">Simulation results</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PdfAction pdf={pdf} onDownload={() => setFeedback("PDF download started.")} />
          <CsvAction runs={runs} filename={pdf.filename.replace(/-report\.pdf$/, "-time-series.csv")} onDownload={() => setFeedback("CSV download started.")} />
          <button type="button" className="theatre-button" onClick={onReplay}><RotateCcw className="size-4" aria-hidden="true" /> Replay</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-2">The PDF includes the plots, checkpoint table, model inputs, sources and educational disclaimer.</p>
      <p role="status" className="theatre-toast mt-2 text-sm">{feedback}</p>
      <h3 className="mt-6 text-sm font-semibold">Overall model results</h3>
      {runs.map(({ id, name, color, result }) => (
        <div key={id} className="mt-5">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="size-2 rounded-full" style={{ background: color }} />{name}</h4>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {reportMetrics(result).map(({ label, value }) => (
              <div key={label} className="theatre-stat">
                <dt className="text-xs text-ink-2">{label}</dt>
                <dd className="mt-2 font-mono text-sm tabular-nums text-brand-text">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div className="mt-7"><ModelChart runs={runs} /></div>
      <h3 className="mt-7 text-sm font-semibold">Absorption and clearance</h3>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <ModelChart runs={runs} metric="gutMg" />
        <ModelChart runs={runs} metric="eliminationMgPerH" />
      </div>
      <p className="mt-3 text-xs text-ink-2">{ELIMINATION_NOTE}</p>
      {runs.length > 1 ? <p className="mt-3 text-xs text-ink-3">{SEPARATE_CURVES_CAPTION}</p> : null}
      <details className="theatre-disclosure mt-5">
        <summary>How this is computed<ChevronDown size={16} aria-hidden="true" /></summary>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-ink-2">
          {RESULT_FORMULAS.map((formula) => <li key={formula}>{formula}</li>)}
        </ul>
      </details>
      <details className="theatre-disclosure mt-5">
        <summary>Guided playback checkpoints<ChevronDown size={16} aria-hidden="true" /></summary>
        <p className="mt-2 text-sm text-ink-2">{primaryRun.name} · Model values at each illustrative arrival time.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr>{CHECKPOINT_COLUMNS.map((label) => <th key={label} scope="col" className="whitespace-nowrap border-b border-line px-2 py-2">{label}</th>)}</tr></thead>
            <tbody>{checkpointRows(data).map(([stage, ...values]) => (
              <tr key={stage}>
                <th scope="row" className="whitespace-nowrap px-2 py-2 font-normal">{stage}</th>
                {values.map((value, index) => <td key={CHECKPOINT_COLUMNS[index + 1]} className="whitespace-nowrap px-2 py-2 font-mono text-ink-2">{value}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      {warnings.length ? <ul className="mt-4 space-y-1 text-sm text-warn">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      <details open={Boolean(study)} className="theatre-disclosure mt-6">
        <summary>Doses, model inputs and sources<ChevronDown size={16} aria-hidden="true" /></summary>
        <p className="mt-2 text-sm text-ink-2">
          {study ? "Fixed study estimates. Volume and clearance use the reported adult totals." : `Volume and clearance use the entered weight of ${active.weightKg} kg.`}
        </p>
        {rows.map((row) => (
          <div key={row.id} className="mt-3 rounded-xl border border-line bg-page/60 p-3">
            <h3 className="font-semibold">{row.name}</h3>
            <p className="mt-1 text-sm text-ink-2">{row.doses.join(" · ")}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {row.parameters.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-brand-text">{value}</dd>
                </div>
              ))}
            </dl>
            <Sources citations={row.citations} />
            {row.notes ? <p className="mt-3 max-w-[78ch] text-sm leading-6 text-ink-2">{row.notes}</p> : null}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {row.references.map(({ label, url }) => (
                <li key={url}><a href={url} target="_blank" rel="noreferrer" className="text-brand-text underline underline-offset-4">{label}</a></li>
              ))}
            </ul>
          </div>
        ))}
        {!study && active.description.trim() ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{active.description}</p> : null}
      </details>
      {reportDisclaimers(data).map((line) => <p key={line} className="mt-4 text-xs leading-5 text-ink-3">{line}</p>)}
    </section>
  );
});

export default RunResults;
