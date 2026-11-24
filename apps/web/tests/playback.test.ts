import { describe, expect, it } from "vitest";
import { simulate } from "@dib/engine";
import { exampleDrug } from "../lib/example-drug";
import { advanceJourney, advancePlayback, buildStages, playbackAt, readMoment, TRAVEL_MS } from "../components/simulator/playback";

describe("guided playback", () => {
  const result = {
    tH: [0, 2, 3, 5, 8, 24, 26, 48],
    concMgPerL: [0, 0, 4, 8, 6, 1, 10, 0.5],
  };

  it("maps all nine stages and Complete to unique, reversible hours around the first peak", () => {
    const stages = buildStages(result, [2, 24]);
    expect(stages.flatMap((stage) => stage.route ? [stage.route] : [])).toEqual([
      "swallow", "absorption", "portal", "right-heart", "lungs", "left-heart", "brain", "liver", "kidneys",
    ]);
    expect(stages.find(({ route }) => route === "brain")?.hours).toBe(5);
    expect(stages.at(-1)?.hours).toBe(48);
    expect(stages.every((stage, index) => index === 0 || stage.hours > stages[index - 1].hours)).toBe(true);
    for (const [index, stage] of stages.entries()) {
      expect(playbackAt(stages, stage.hours)).toEqual({ index, fraction: 1, holding: true });
    }
  });

  it("identifies travel vs arrival using the scrubbed hour alone", () => {
    const stages = buildStages(result, [2, 24]);
    const lungsIndex = stages.findIndex(({ route }) => route === "lungs");
    const lungs = stages[lungsIndex];
    expect(playbackAt(stages, (lungs.startsAtH + lungs.hours) / 2)).toEqual({ index: lungsIndex, fraction: 0.5, holding: false });
    expect(advancePlayback(stages, lungs.startsAtH, TRAVEL_MS)).toBe(lungs.hours);
    expect(playbackAt(stages, lungs.startsAtH - 0.001).index).toBe(lungsIndex - 1);
  });

  it("plays the opening swallow while the model stays at hour zero", () => {
    const stages = buildStages(result, [0]);
    const opening = { hours: 0, swallowElapsedMs: 0 };
    expect(playbackAt(stages, opening.hours, opening.swallowElapsedMs)).toEqual({ index: 0, fraction: 0, holding: false });

    const halfway = advanceJourney(stages, opening, TRAVEL_MS / 2);
    expect(halfway.hours).toBe(0);
    expect(playbackAt(stages, halfway.hours, halfway.swallowElapsedMs)).toEqual({ index: 0, fraction: 0.5, holding: false });

    const arrived = advanceJourney(stages, halfway, TRAVEL_MS / 2);
    expect(arrived.hours).toBe(0);
    expect(playbackAt(stages, arrived.hours, arrived.swallowElapsedMs)).toEqual({ index: 0, fraction: 1, holding: true });
    expect(advanceJourney(stages, arrived, 100).hours).toBe(advancePlayback(stages, 0, 100));
    expect(advanceJourney(stages, opening, TRAVEL_MS + 100)).toEqual(advanceJourney(stages, arrived, 100));
  });

  it("keeps all route stops accessible when the first dose is on the final sample", () => {
    const stages = buildStages({ ...result, concMgPerL: result.tH.map(() => 0) }, [48]);
    expect(stages).toHaveLength(10);
    expect(stages.every((stage, index) => index === 0 || stage.hours > stages[index - 1].hours)).toBe(true);
    expect(playbackAt(stages, 48).index).toBe(stages.length - 1);
  });

  it("reads the same values as the engine at a scrubbed off-grid time", () => {
    const hours = 8.99;
    const input = {
      profile: { ageYears: 30, weightKg: 70, sex: "other" as const },
      drug: exampleDrug,
      doses: [{ drugId: exampleDrug.id, doseMg: 100, timeH: 0 }],
      tEndH: 12,
    };
    const curve = simulate(input);
    const engine = simulate({ ...input, sampleAtH: [hours] });
    const position = engine.tH.indexOf(hours);
    const moment = readMoment(curve, hours);
    expect(moment.hours).toBe(hours);
    expect(moment.concMgPerL).toBeCloseTo(engine.concMgPerL[position], 7);
    expect(moment.gutMg).toBeCloseTo(engine.gutMg[position], 4);
    expect(moment.bodyMg).toBeCloseTo(engine.bodyMg[position], 4);
    expect(moment.eliminationMgPerH).toBeCloseTo(engine.eliminationMgPerH[position], 5);
  });

  it("preserves the gut jump at its exact off-grid time, including scheduled lag", () => {
    const timeH = 0.17;
    const curve = simulate({
      profile: { ageYears: 30, weightKg: 70, sex: "other" },
      drug: { ...exampleDrug, tlag_h: 0.1 },
      doses: [{ drugId: exampleDrug.id, doseMg: 100, timeH }],
      tEndH: 1,
      sampleAtH: [timeH + 0.1],
    });
    expect(readMoment(curve, 0.269).gutMg).toBe(0);
    expect(readMoment(curve, 0.27).gutMg).toBe(100);
  });
});
