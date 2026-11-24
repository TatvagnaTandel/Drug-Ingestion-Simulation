import { SEPARATE_CURVES_CAPTION } from "@/lib/treatment";
import { jsPDF } from "jspdf";
import { conditionById } from "./condition";
import { ROUTE_COPY } from "./playback";
import {
  CHECKPOINT_COLUMNS, ELIMINATION_NOTE, RESULT_FORMULAS, SERIES_LABELS, chartData,
  checkpointRows, parameterRows, reportDisclaimers, reportMetrics, type ReportData, type Series,
} from "./report-data";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const CONTENT = PAGE_WIDTH - 2 * MARGIN;
const FOOTER = 276;
const INK = "#152736";
const MUTED = "#435665";
const ACCENT = "#057787";
const RULE = "#d4dfe6";

const pdfText = (value: string) => value.replace(/[–—]/g, "-").replace(/[•]/g, " · ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function generateReportPdf(data: ReportData): Blob {
  const { active, isExample, primaryRun, runs, stages, study, treatmentLabel } = data;
  const warnings = [...new Set(runs.flatMap(({ name, result }) => result.warnings.map((warning) => `${name}: ${warning}`)))];
  const doc = new jsPDF({ format: "a4", unit: "mm", compress: true });
  doc.setProperties({ title: pdfText(`${treatmentLabel} | Manava simulation`), subject: "Educational oral pharmacokinetic simulation" });
  let y = MARGIN;

  function reserve(height: number) {
    if (y + height <= FOOTER) return;
    doc.addPage();
    y = MARGIN;
  }

  function heading(text: string, size = 14) {
    reserve(17);
    doc.setFont("helvetica", "bold").setFontSize(size).setTextColor(INK);
    doc.text(text, MARGIN, y);
    y += size > 20 ? 10 : 7;
  }

  function paragraph(text: string, options: { url?: string; size?: number } = {}) {
    const { url, size = 10 } = options;
    const normalized = pdfText(text);
    const step = size * 0.49;
    doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(url ? ACCENT : MUTED);

    // Helvetica has limited character coverage. Use the browser's font
    // fallback for text outside that coverage, such as a case note in Hindi.
    if (/[^\x00-\xff]/.test(normalized)) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(CONTENT * 8);
      canvas.height = Math.ceil(step * 8);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to render report text");
      context.font = `${Math.round(size * 2.82)}px sans-serif`;
      context.fillStyle = url ? ACCENT : MUTED;
      context.textBaseline = "middle";
      const draw = (line: string) => {
        reserve(step);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillText(line, 0, canvas.height / 2);
        doc.addImage(canvas, "PNG", MARGIN, y - step * 0.72, CONTENT, step);
        y += step;
      };
      for (const block of normalized.split("\n")) {
        let line = "";
        for (const word of block.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (context.measureText(candidate).width <= canvas.width) {
            line = candidate;
          } else {
            if (line) draw(line);
            line = "";
            for (const letter of word) {
              if (context.measureText(line + letter).width > canvas.width) {
                draw(line);
                line = "";
              }
              line += letter;
            }
          }
        }
        draw(line);
      }
    } else {
      const lines: string[] = doc.splitTextToSize(normalized, CONTENT);
      for (const line of lines) {
        reserve(step);
        if (url) doc.textWithLink(line, MARGIN, y, { url });
        else doc.text(line, MARGIN, y);
        y += step;
      }
    }
    y += 1.5;
  }

  paragraph("MANAVA  /  SIMULATION REPORT", { size: 10 });
  y += 3;
  if (/[^\x00-\xff]/.test(pdfText(treatmentLabel))) paragraph(treatmentLabel, { size: 22 });
  else heading(pdfText(treatmentLabel), 24);
  paragraph(`${active.tEndH} hours | Oral, one-compartment model | ${study ? "Research-based example" : isExample ? "Synthetic example" : "Custom simulation"}`);
  if (active.drugs.length > 1) paragraph(SEPARATE_CURVES_CAPTION);
  y += 5;

  for (const run of runs) {
    reserve(53);
    if (/[^\x00-\xff]/.test(pdfText(run.name))) paragraph(run.name, { size: 12 });
    else heading(pdfText(run.name), 12);
    const tileWidth = CONTENT / 2;
    reportMetrics(run.result).forEach(({ label, value }, index) => {
      const x = MARGIN + index % 2 * tileWidth;
      const top = y + Math.floor(index / 2) * 21;
      doc.setFillColor("#eff6f8").roundedRect(x, top - 3, tileWidth - 3, 19, 2, 2, "F");
      doc.setTextColor(MUTED).setFont("helvetica", "normal").setFontSize(9).text(pdfText(label), x + 4, top + 3);
      doc.setTextColor(ACCENT).setFont("helvetica", "bold").setFontSize(13).text(pdfText(value), x + 4, top + 10);
    });
    y += 44;
  }

  const pdfColors = [ACCENT, "#b4376e", "#977019", "#247959", "#7851a6"];
  function plot(metric: Series, height: number, note: string | undefined = undefined) {
    reserve(height + 24 + (note ? 6 : 0) + (runs.length > 1 ? 5 * runs.length : 0));
    heading(SERIES_LABELS[metric]);
    if (note) paragraph(note, { size: 9 });
    const chart = chartData(runs, metric);
    const x = MARGIN + 16;
    const width = CONTENT - 19;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MUTED);
    for (const tick of [0, 0.5, 1]) {
      const tickY = y + tick * height;
      doc.setLineWidth(0.18).setDrawColor(RULE).line(x, tickY, x + width, tickY);
      const label = tick === 1 ? "0" : (chart.max * (1 - tick)).toPrecision(3);
      doc.text(label, x - 2, tickY + 1, { align: "right" });
      doc.text(`${chart.duration * tick} h`, x + width * tick, y + height + 5, { align: "center" });
    }
    chart.series.forEach(({ points }, index) => {
      const segments = points.slice(1).map(([px, py], i) => [
        (px - points[i][0]) * width,
        (py - points[i][1]) * height,
      ]);
      const [px, py] = points[0];
      doc.setDrawColor(pdfColors[index % pdfColors.length]).setLineWidth(0.55)
        .lines(segments, x + px * width, y + py * height);
    });
    y += height + 12;
    if (runs.length > 1) {
      runs.forEach(({ name }, index) => {
        doc.setDrawColor(pdfColors[index % pdfColors.length]).line(x, y - 1, x + 5, y - 1);
        doc.text(pdfText(name), x + 8, y);
        y += 5;
      });
    }
    y += 4;
  }

  plot("concMgPerL", 46, "Shared by Heart, Lungs, Brain");
  plot("gutMg", 30);
  plot("eliminationMgPerH", 30, ELIMINATION_NOTE);
  heading("How this is computed");
  for (const formula of RESULT_FORMULAS) paragraph(formula, { size: 9 });
  y += 4;

  const checkpoints = checkpointRows(data);
  reserve(28 + 6 * checkpoints.length);
  heading("Guided playback checkpoints");
  paragraph(`${primaryRun.name} · Model values at each illustrative arrival time.`, { size: 9 });
  const columns = [MARGIN + 3, 59, 83, 112, 135, 164];
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(INK);
  CHECKPOINT_COLUMNS.forEach((label, index) => doc.text(label, columns[index], y));
  y += 6;
  for (const [index, row] of checkpoints.entries()) {
    if (index % 2 === 0) doc.setFillColor("#eff6f8").rect(MARGIN, y - 4, CONTENT, 6, "F");
    doc.setTextColor(INK).setFont("helvetica", "normal").setFontSize(9);
    row.forEach((text, i) => doc.text(text, columns[i], y));
    y += 6;
  }
  y += 5;
  for (const disclaimer of reportDisclaimers(data)) paragraph(disclaimer, { size: 9 });

  y += 5;
  reserve(65);
  heading("Doses, model inputs and sources");
  const condition = conditionById(active.conditionId);
  paragraph(`Anatomy context: ${condition.label}`);
  if (study) paragraph("Fixed study estimates. The run uses the reported adult volume and clearance totals.");
  else paragraph(`Profile: ${active.ageYears} years, ${active.weightKg} kg, ${active.sex || "sex unspecified"}. Volume and clearance scale with weight.`);
  if (!study && active.description.trim()) paragraph(`Case note: ${active.description.trim()}`);

  for (const row of parameterRows(data)) {
    y += 5;
    if (/[^\x00-\xff]/.test(pdfText(row.name))) paragraph(row.name, { size: 14 });
    else heading(row.name, 12);
    paragraph(`Oral doses: ${row.doses.join(", ")}`);
    paragraph(row.parameters.map(({ label, value }) => `${label}: ${value}`).join(" | "));
    if (row.notes) paragraph(row.notes);
    for (const citation of row.citations ?? []) {
      paragraph(`${citation.parameter} - ${citation.sourceTitle || citation.sourceUrl}`, { url: citation.sourceUrl, size: 9 });
    }
    for (const { label, url } of row.references) {
      paragraph(label, { url });
      paragraph(url, { url, size: 8 });
    }
  }

  if (warnings.length) {
    y += 4;
    heading("Run notes", 12);
    for (const warning of warnings) paragraph(warning);
  }
  y += 5;
  heading("First-dose route", 12);
  paragraph("The anatomy illustrates a common oral route. The times mark illustrative windows derived from the modeled curve.", { size: 9 });
  for (const stage of stages) {
    if (stage.route) paragraph(`${stage.label}: ${ROUTE_COPY[stage.route]}`, { size: 9 });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setLineWidth(0.22).setDrawColor(RULE).line(MARGIN, PAGE_HEIGHT - 15, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 15);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MUTED);
    doc.text("Manava Simulator", MARGIN, PAGE_HEIGHT - 9);
    doc.text(`${page} / ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 9, { align: "right" });
  }
  return doc.output("blob");
}
