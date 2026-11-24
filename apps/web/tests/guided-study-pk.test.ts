import { describe, expect, it } from "vitest";
import { simulate, type BodyProfile } from "@dib/engine";
import { STUDY_CASES } from "../lib/study-cases";
import { reportMetrics } from "../components/simulator/report-data";
import { serializeTimeSeries } from "../components/simulator/report-csv";

const profile: BodyProfile = { ageYears: 30, weightKg: 70, sex: "other" };
const [levetiracetam, linezolid] = STUDY_CASES.map(({ input }) => input.drugs[0]);
const concentration = (t: number, dose: number, ka: number, ke: number, volume: number) =>
  t < 0 ? 0 : (dose * ka / (volume * (ka - ke))) * (Math.exp(-ke * t) - Math.exp(-ka * t));
const inputs = (line: typeof levetiracetam) => ({
  profile,
  drug: line.drug,
  doses: line.doses.map((dose) => ({ ...dose, drugId: line.drug.id })),
  tEndH: 48,
});

describe("guided PK study cases", () => {
  it("matches the independent analytical levetiracetam peak, tail, AUC and half-life", () => {
    const ke = 3.26 / 34.7;
    const ka = 0.616;
    const expectedPeakTime = Math.log(ka / ke) / (ka - ke);
    const result = simulate(inputs(levetiracetam));
    expect(result.tmaxH).toBe(3.60);
    expect(result.tmaxH).toBeCloseTo(expectedPeakTime, 2);
    expect(result.cmaxMgPerL).toBeCloseTo(concentration(expectedPeakTime, 500, ka, ke, 34.7), 4);
    expect(result.cmaxMgPerL).toBeCloseTo(10.3, 1);
    expect(result.concMgPerL.at(-1)).toBeCloseTo(0.187, 3);
    expect(result.concMgPerL.at(-1)).toBeCloseTo(concentration(48, 500, ka, ke, 34.7), 6);
    const integrated = (1 - Math.exp(-ke * 48)) / ke - (1 - Math.exp(-ka * 48)) / ka;
    const expectedAuc = (500 * ka / (34.7 * (ka - ke))) * integrated;
    const metrics = reportMetrics(result);
    expect(metrics).toContainEqual({ label: "AUC(0–48 h)", value: `${expectedAuc.toFixed(2)} mg·h/L` });
    expect(metrics).toContainEqual({ label: "Elimination half-life", value: `${(Math.log(2) / ke).toFixed(2)} h` });
  });

  it("superposes the two Linezolid 600 mg doses, including the 24 h boundary", () => {
    const result = simulate(inputs(linezolid));
    for (const t of [0, 1.4, 23.95, 24, 24.05, 25.45, 48]) {
      const singleDoseAt = (elapsed: number) => concentration(elapsed, 600, 1.5, 0.25, 29.6);
      expect(result.concMgPerL[result.tH.indexOf(t)]).toBeCloseTo(singleDoseAt(t) + singleDoseAt(t - 24), 4);
    }
    expect(result.gutMg[result.tH.indexOf(24)]).toBeCloseTo(600, 8);
  });

  it("scales concentration inversely with weight while preserving peak time and elimination rate constant", () => {
    const input = inputs(levetiracetam);
    const reference = simulate(input);
    const scaled = simulate({ ...input, profile: { ...profile, weightKg: 100 } });
    expect(scaled.cmaxMgPerL).toBeCloseTo(concentration(3.6, 500, 0.616, 3.26 / 34.7, 34.7 / 70 * 100), 6);
    expect(scaled.cmaxMgPerL / reference.cmaxMgPerL).toBeCloseTo(0.7, 10);
    expect(scaled.tmaxH).toBe(reference.tmaxH);
    expect(scaled.eliminationHalfLifeH).toBeCloseTo(reference.eliminationHalfLifeH ?? 0, 10);
  });

  it("exports independent series for up to five medicines and preserves their native units", () => {
    const rows = Array.from({ length: 5 }, (_, index) => {
      const id = `fixture-${index}`;
      const name = index ? `Fixture ${index}` : 'Fixture, "quoted"';
      const doseMg = 100 * (index + 1);
      const input = inputs(levetiracetam);
      const result = simulate({
        ...input, drug: { ...input.drug, id, name }, doses: [{ drugId: id, doseMg, timeH: 0 }], tEndH: 1,
      });
      expect(result.concMgPerL.at(-1)).toBeCloseTo(concentration(1, doseMg, 0.616, 3.26 / 34.7, 34.7), 6);
      return { id, name, color: "#fff", result };
    });
    const csvRows = serializeTimeSeries(rows).trimEnd().split("\r\n");
    expect(csvRows[0]).toBe("medicine_id,medicine_name,time_h,central_concentration_mg_per_l,gut_amount_mg,central_amount_mg,total_elimination_mg_per_h");
    expect(csvRows[1]).toBe('fixture-0,"Fixture, ""quoted""",0,0,100,0,0');
    expect(csvRows).toHaveLength(106);
    expect(csvRows.at(-1)?.startsWith("fixture-4,Fixture 4,1,")).toBe(true);
    expect(serializeTimeSeries([{ ...rows[0], name: "=1+1" }])).toContain("fixture-0,'=1+1,0,0,100,0,0");
  });

  it("changes only the observed window and profiles a zero-dose run without inventing exposure", () => {
    const input = inputs(levetiracetam);
    const short = simulate({ ...input, tEndH: 8.99 });
    expect(short.tH.at(-1)).toBe(8.99);
    expect(short.concMgPerL.at(-1)).toBeCloseTo(concentration(8.99, 500, 0.616, 3.26 / 34.7, 34.7), 6);
    const emptyExposure = simulate({ ...input, doses: [{ drugId: input.drug.id, timeH: 0, doseMg: 0 }] });
    expect(emptyExposure.concMgPerL.every((value) => value === 0)).toBe(true);
    expect(reportMetrics(emptyExposure)).toContainEqual({ label: "AUC(0–48 h)", value: "0.00 mg·h/L" });
    expect(() => simulate({ ...input, tEndH: 0 })).toThrow(/window/);
    expect(() => simulate({ ...input, profile: { ...profile, weightKg: 0 } })).toThrow(/weight/);
    expect(() => simulate({ ...input, doses: [{ drugId: input.drug.id, timeH: -1, doseMg: 500 }] })).toThrow(/dose time/);
    expect(() => simulate({ ...input, doses: [{ drugId: input.drug.id, timeH: 0, doseMg: -1 }] })).toThrow(/dose/);
    expect(() => simulate({ ...input, drug: { ...input.drug, F: 0 } })).toThrow(/bioavailability/);
  });
});
