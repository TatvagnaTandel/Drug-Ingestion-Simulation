import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimulatorConsole, { type SimulatorInput } from "../components/simulator/console";
import { decodeSavedSetup, persistLabSetup } from "../lib/run-setup";
import LabConsole, { type SimulatorInput as LabInput } from "../components/organ-lab/console";

const input: SimulatorInput = {
  conditionId: "general", description: "", ageYears: 30, weightKg: 70, sex: "", tEndH: 48, drugs: [],
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("custom setup", () => {
  it("shows the same three setup steps and summary before revealing validation", () => {
    const html = renderToStaticMarkup(
      createElement(SimulatorConsole, { value: input, onChange: vi.fn(), onSubmit: vi.fn(), error: null }),
    );
    const lab = renderToStaticMarkup(createElement(LabConsole, {
      value: { ...input, ageYears: "30", weightKg: "70", drugs: [], clearanceScenario: "baseline" },
      onChange: vi.fn(), onSubmit: vi.fn(), error: null,
    }));
    for (const markup of [html, lab]) {
      expect(markup).toMatch(/<h3[^>]*>Medicines<\/h3>.*<h3[^>]*>Person<\/h3>.*<h3[^>]*>Window and run<\/h3>/);
      expect(markup).toContain("Setup summary");
      expect(markup).toContain("No medicines selected");
      expect(markup).toContain('aria-disabled="true"');
      expect(markup).not.toContain('role="alert"');
      expect(markup).not.toContain("Add a medicine to run.");
    }
  });

  it("does not persist PDF text, filenames, notes or supplemental fields", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    const lab: LabInput = {
      conditionId: "general", description: "fictional note", ageYears: "30", weightKg: "72", sex: "",
      tEndH: 48, importedPdf: true, clearanceScenario: "baseline",
      drugs: [{
        drugId: "ibuprofen", name: "Ibuprofen", hasPk: true, doseRange: [292, 300],
        doses: [{ doseMg: "300", timeH: "0", doseFromPdf: true }],
      }],
      extraFields: [{ key: "fictional-test-field", label: "fictional snippet", value: "4.7" }],
    };
    persistLabSetup(lab);
    const raw = setItem.mock.calls[0]?.[1];
    expect(typeof raw).toBe("string");
    expect(raw).not.toMatch(/fictional|doseFromPdf|extraFields|description/);
    expect(decodeSavedSetup(raw, "lab")).toMatchObject({ importedPdf: true, weightKg: 72, drugs: [{ doses: [{ doseMg: 300, timeH: 0 }] }] });
    expect(decodeSavedSetup(raw.replace('"doseMg":300', '"doseMg":0'), "lab")).toBeNull();
    expect(decodeSavedSetup(raw.replace('"timeH":0', '"timeH":49'), "lab")).toBeNull();
  });
});
