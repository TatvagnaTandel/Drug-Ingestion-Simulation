import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readMedicalPdf } from "../lib/pdf-import";
import { appendPdfText, extractPdfMatches, reviewPdfMatch } from "../lib/pdf-parse";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
  VerbosityLevel: { ERRORS: 0 },
}));

afterEach(() => { getDocument.mockReset(); });

const syntheticReport = readFileSync(new URL("./fixtures/pdf-measurements.txt", import.meta.url), "utf8");

describe("medical PDF candidates", () => {
  it("maps explicit simulator units and keeps other measurements for review", () => {
    const matches = extractPdfMatches(syntheticReport);

    expect(matches.map(({ key, value, unit }) => ({ key, value, unit }))).toEqual([
      { key: "weightKg", value: "72", unit: "kg" },
      { key: "ageYears", value: "42", unit: "years" },
      { key: "extra", value: "1.1", unit: "mg/dL" },
      { key: "extra", value: "2", unit: "mg/kg" },
      { key: "extra", value: "0.25", unit: "g" },
      { key: "doseMg", value: "125", unit: "mg" },
      { key: "extra", value: "-5", unit: "mg" },
      { key: "extra", value: "30", unit: "min" },
      { key: "extra", value: "160", unit: "lb" },
      { key: "extra", value: "50", unit: undefined },
      { key: "extra", value: "2", unit: "mg/mL" },
      { key: "tEndH", value: "48", unit: "h" },
    ]);
    expect(matches[2]).toMatchObject({
      range: "0.6–1.3 mg/dL",
      raw: "Serum Creatinine 1.1 (0.6–1.3) mg/dL",
    });
  });

  it("keeps PDF.js cells together and separates rows", () => {
    const output: { text: string; baseline?: number } = { text: "" };
    appendPdfText(output, { str: "Weight", hasEOL: false, transform: [1, 0, 0, 1, 20, 50] });
    appendPdfText(output, { str: "72", hasEOL: false, transform: [1, 0, 0, 1, 180, 50] });
    appendPdfText(output, { str: "kg", hasEOL: false, transform: [1, 0, 0, 1, 240, 50] });
    appendPdfText(output, { str: "Age", hasEOL: false, transform: [1, 0, 0, 1, 20, 40] });
    appendPdfText(output, { str: "30 years", hasEOL: true, transform: [1, 0, 0, 1, 180, 40] });
    expect(output.text).toBe("Weight 72 kg\nAge 30 years\n");
  });

  it("uses confirmed edits only when the edited number and unit are compatible", () => {
    const [weight] = extractPdfMatches("Weight: 160 lb");
    expect(weight.confidence).toBe("Low");
    expect(reviewPdfMatch(weight, "72", "kg")).toMatchObject({ key: "weightKg", value: "72", unit: "kg" });
    expect(reviewPdfMatch(weight, "400", "kg")).toMatchObject({ key: "extra" });
    expect(reviewPdfMatch(weight, "", "kg")).toBeNull();
    expect(reviewPdfMatch(weight, "1e8", "kg")).toBeNull();
  });

  it("rejects a renamed non-PDF before loading the PDF reader", async () => {
    const file = Object.assign(new Blob(["not a PDF"], { type: "application/pdf" }), { name: "report.pdf" });
    await expect(readMedicalPdf(file)).rejects.toThrow("That file is not a PDF");
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("rejects more than 10 MB before reading the document", async () => {
    const file = Object.assign(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), { name: "report.pdf" });
    await expect(readMedicalPdf(file)).rejects.toThrow("exceeds 10 MB");
    expect(getDocument).not.toHaveBeenCalled();
  });
});

describe("PDF reader errors", () => {
  const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });

  it.each([
    ["PasswordException", "password-protected"],
    ["InvalidPDFException", "appears to be damaged"],
  ])("explains %s without exposing parser details", async (name, message) => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockImplementationOnce(() => ({
      promise: Promise.reject(Object.assign(new Error("internal parser details"), { name })),
      destroy,
    }));

    await expect(readMedicalPdf(pdf)).rejects.toThrow(message);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("explains the missing text layer on an image-only page", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn();
    getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          streamTextContent: () => new ReadableStream({ start: (controller) => controller.close() }),
          cleanup,
        }),
      }),
      destroy,
    });

    await expect(readMedicalPdf(pdf)).rejects.toThrow("scanned PDF with no text layer");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
