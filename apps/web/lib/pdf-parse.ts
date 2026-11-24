import { ageError, doseError, doseTimeError, weightError, windowError } from "./setup-validation";

const FIELD_UNITS = {
  ageYears: /^(?:years?|yrs?\.?|y)$/i,
  weightKg: /^kg$/i,
  doseMg: /^mg$/i,
  timeH: /^(?:hours?|hrs?\.?|h)$/i,
  tEndH: /^(?:hours?|hrs?\.?|h)$/i,
};

export type PdfFieldKey = keyof typeof FIELD_UNITS | "extra";

export type PdfFieldMatch = {
  key: PdfFieldKey;
  name: string;
  value: string;
  unit?: string;
  range?: string;
  raw: string;
  confidence: "High" | "Low";
};

export type PdfImportResult = {
  matches: PdfFieldMatch[];
};

const MAX_MATCHES = 100;

const FIELD_ALIASES = {
  ageYears: ["age", "patient age"],
  weightKg: ["weight", "body weight", "patient weight", "body mass"],
  doseMg: ["dose", "dose amount", "administered dose", "dose administered", "mg dose"],
  timeH: ["time", "hour", "administration time", "dose time", "time point"],
  tEndH: ["duration", "window", "simulation window", "time window", "observation period"],
} as const;

// shortcut: simple labelled rows only, use a structured import for documents with complex tables.
const LABEL = String.raw`[A-Za-z][\p{L}\d ()/%.-]{0,59}?`;
const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+|,\d{1,2})?|\.\d+)`;
const UNIT = String.raw`(?:[\p{L}%°][\p{L}%°²³.]*)(?:\s*/\s*[\p{L}\d²³.]+)*`;
const RANGE = String.raw`(?:(?:\(\s*|(?:normal|reference|ref|range|expected)\s*:?\s*)(?<low>${NUMBER})\s*(?:-|–|—|to)\s*(?<high>${NUMBER})\s*(?<rangeUnit>${UNIT})?\s*\)?)`;
const LABELLED_LINE = new RegExp(
  String.raw`^(?<label>${LABEL})(?<separator>\s*[:=]\s*|\s+[-–]\s+|\s+)(?<value>${NUMBER})(?:\s+(?<unit>${UNIT}))?(?:\s*${RANGE})?(?:\s+(?<endUnit>${UNIT}))?$`,
  "iu",
);

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function fieldFor(name: string): [keyof typeof FIELD_UNITS | undefined, string | undefined] {
  const labelUnit = /\(([^()]+)\)$/.exec(name)?.[1] ?? /\s+(\p{L}+\.?$)/u.exec(name)?.[1];
  const normalizedName = normalizeLabel(name);
  const normalizedBase = labelUnit ? normalizeLabel(name.slice(0, name.lastIndexOf(labelUnit))) : normalizedName;
  const field = (Object.keys(FIELD_ALIASES) as (keyof typeof FIELD_UNITS)[]).find((field) => {
    const aliases: readonly string[] = FIELD_ALIASES[field];
    return aliases.includes(normalizedName)
      || (labelUnit && FIELD_UNITS[field].test(labelUnit.trim()) && aliases.includes(normalizedBase));
  });
  return [field, labelUnit];
}

const validFor = (field: keyof typeof FIELD_UNITS, value: string): boolean => {
  switch (field) {
    case "ageYears": return !ageError(value);
    case "weightKg": return !weightError(value);
    case "doseMg": return !doseError(value);
    case "timeH": return !doseTimeError(value, 96);
    case "tEndH": return !windowError(Number(value));
  }
};

const reviewNumber = new RegExp(`^${NUMBER}$`);

export function reviewPdfMatch(match: PdfFieldMatch, rawValue: string, rawUnit: string): PdfFieldMatch | null {
  const value = rawValue.trim().replace(",", ".");
  const unit = rawUnit.trim() || undefined;
  if (value.length > 24 || !reviewNumber.test(value) || !Number.isFinite(Number(value))) return null;
  if (match.value === value && match.unit === unit) return match;
  const [field] = fieldFor(match.name);
  const key = field && validFor(field, value) && unit && FIELD_UNITS[field].test(unit) ? field : "extra";
  return { ...match, value, unit, key };
}

/** Join PDF.js cells on their baseline, including cells in separate stream chunks. */
export function appendPdfText(
  output: { text: string; baseline?: number },
  item: { str: string; transform: readonly number[]; hasEOL: boolean },
): void {
  const baseline = item.transform[5];
  if (output.baseline !== undefined && Math.abs(output.baseline - baseline) > 2) output.text += "\n";
  if (item.str) {
    if (output.text && !/\s$/.test(output.text) && !/^\s/.test(item.str)) output.text += " ";
    output.text += item.str;
  }
  if (item.hasEOL) output.text += "\n";
  output.baseline = item.hasEOL ? undefined : baseline;
}

export function extractPdfMatches(text: string): PdfFieldMatch[] {
  const matches: PdfFieldMatch[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (raw.length < 3 || raw.length > 240) continue;

    const parts = LABELLED_LINE.exec(raw.replace(/\s*\|\s*/g, " "))?.groups;
    if (!parts) continue;
    const name = parts.label.trim();
    const value = parts.value.replace(",", ".");
    if (!Number.isFinite(Number(value))) continue;

    const [field, labelUnit] = fieldFor(name);

    const unitInLabel = labelUnit && (name.endsWith(")") || (field && FIELD_UNITS[field].test(labelUnit)))
      ? labelUnit.trim()
      : undefined;
    const unit = (parts.unit ?? parts.endUnit ?? unitInLabel)?.replace(/\s+/g, "");
    if (!unit && !parts.low && parts.separator === " ") continue;

    const key = field && validFor(field, value) && unit && FIELD_UNITS[field].test(unit)
      && [parts.unit, parts.endUnit, parts.rangeUnit, unitInLabel].every(
        (explicitUnit) => !explicitUnit || FIELD_UNITS[field].test(explicitUnit),
      )
      ? field
      : "extra";

    const rangeUnit = parts.rangeUnit ?? unit;
    const range = parts.low
      ? `${parts.low.replace(",", ".")}–${parts.high.replace(",", ".")}${rangeUnit ? ` ${rangeUnit}` : ""}`
      : undefined;

    if (matches.length === MAX_MATCHES) {
      throw new Error("This PDF has more than 100 labelled values. Choose a shorter report.");
    }
    matches.push({
      key,
      name,
      value,
      unit,
      range,
      raw,
      confidence: key === "extra" ? "Low" : "High",
    });
  }

  return matches;
}
