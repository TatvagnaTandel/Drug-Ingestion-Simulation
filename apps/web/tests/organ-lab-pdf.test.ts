import { describe, expect, it } from "vitest";
import { applyPdfImport } from "../components/organ-lab/apply-pdf";
import type { SimulatorInput } from "../components/organ-lab/console";
import type { PdfFieldMatch } from "../lib/pdf-parse";

const draft: SimulatorInput = {
  conditionId: "general",
  description: "",
  ageYears: "30",
  weightKg: "70",
  sex: "other",
  tEndH: 48,
  clearanceScenario: "baseline",
  drugs: ["first", "second"].map((drugId) => ({
    drugId,
    name: drugId,
    doseRange: null,
    hasPk: true,
    doses: [{ doseMg: "100", timeH: "0" }],
  })),
};

const dose: PdfFieldMatch = { key: "doseMg", name: "Dose", value: "25", unit: "mg", confidence: "High", raw: "Dose 25 mg" };
const time: PdfFieldMatch = { key: "timeH", name: "Dose time", value: "4", unit: "h", confidence: "High", raw: "Dose time 4 h" };
const extracted = (...matches: PdfFieldMatch[]) => ({ matches });

describe("reviewed Organ Lab PDF values", () => {
  it("keeps the dose supplemental until a specific medicine is selected", () => {
    const pdf = extracted(dose, time);
    const supplemental = applyPdfImport(draft, pdf);
    expect(supplemental.importedPdf).toBe(true);
    expect(supplemental.drugs).toEqual(draft.drugs);
    expect(supplemental.extraFields).toHaveLength(2);

    const attached = applyPdfImport(draft, pdf, "second");
    expect(attached.drugs[0]).toEqual(draft.drugs[0]);
    expect(attached.drugs[1].doses).toEqual([
      ...draft.drugs[1].doses,
      { doseMg: "25", timeH: "4", doseFromPdf: true, timeFromPdf: true },
    ]);
    expect(attached.extraFields).toHaveLength(0);
  });

  it("does not replace a dose schedule when multiple dose amounts are present", () => {
    const pdf = extracted(dose, { ...dose, value: "50", raw: "Dose 50 mg" }, time);
    const result = applyPdfImport(draft, pdf, "second");
    expect(result.drugs).toEqual(draft.drugs);
    expect(result.extraFields).toHaveLength(3);
  });
});
