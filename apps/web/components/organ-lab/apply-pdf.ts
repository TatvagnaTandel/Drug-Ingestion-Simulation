import { MAX_DOSES_PER_DRUG } from "@dib/data-client";
import type { PdfFieldMatch, PdfImportResult } from "@/lib/pdf-parse";
import { ageError, doseError, doseTimeError, weightError, windowError } from "@/lib/setup-validation";
import type { SimulatorInput } from "./console";

/** Apply only reviewed values and keep ambiguous readings as supplemental data. */
export function applyPdfImport(
  input: SimulatorInput,
  imported: PdfImportResult,
  destination = "",
): SimulatorInput {
  const single = (key: PdfFieldMatch["key"]) => {
    const found = imported.matches.filter((match) => match.key === key);
    return found.length === 1 ? found[0] : undefined;
  };
  const age = single("ageYears");
  const weight = single("weightKg");
  const window = single("tEndH");
  const dose = single("doseMg");
  const time = single("timeH");
  const used = new Set<PdfFieldMatch>();
  const next = { ...input, importedPdf: true };

  if (age && !ageError(age.value)) {
    next.ageYears = age.value;
    next.ageFromPdf = true;
    used.add(age);
  }
  if (weight && !weightError(weight.value)) {
    next.weightKg = weight.value;
    next.weightFromPdf = true;
    used.add(weight);
  }
  if (window && !windowError(Number(window.value)) &&
      input.drugs.every((drug) => drug.doses.every((row) => Number(row.timeH) <= Number(window.value)))) {
    next.tEndH = Number(window.value);
    next.windowFromPdf = true;
    used.add(window);
  }

  if (dose && time && !doseError(dose.value) && !doseTimeError(time.value, next.tEndH)) {
    next.drugs = input.drugs.map((drug) => {
      if (drug.drugId !== destination || drug.doses.length >= MAX_DOSES_PER_DRUG) return drug;
      used.add(dose);
      used.add(time);
      return {
        ...drug,
        doses: [...drug.doses, { doseMg: dose.value, timeH: time.value, doseFromPdf: true, timeFromPdf: true }],
      };
    });
  }

  const extra = input.extraFields ?? [];
  next.extraFields = [...extra, ...imported.matches.filter((match) => !used.has(match)).map((match, index) => ({
    key: `pdf-${extra.length}-${index}`,
    label: [match.name, match.unit, match.range].filter(Boolean).join(" · "),
    value: match.value,
    unit: match.unit,
    range: match.range,
    fromPdf: true,
  }))];
  return next;
}
