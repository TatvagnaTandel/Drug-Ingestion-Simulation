import { describe, it, expect } from 'vitest';
import { simulate, FAILURE_THRESHOLD } from '../index';
import { fixtureDrug } from './fixtures/fixtureDrug';
import type { BodyProfile } from '../types';

const profile: BodyProfile = { ageYears: 30, weightKg: 70, sex: 'M' };

describe('synthetic toxicity / organ failure', () => {
  it('does not award a teaching score for a dose within the studied range', () => {
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 100, timeH: 0 }],
      tEndH: 24,
      dtH: 0.05,
    });
    expect(result.toxicity).toBeDefined();
    expect(result.toxicity!.failedOrgans).toHaveLength(0);
    expect(result.toxicity!.death).toBeNull();
    expect(result.toxicity!.message).toBeNull();
  });

  it('an out-of-range fixture dose can fail a vital organ in the teaching model', () => {
    // Studied ceiling is 500 mg; 6000 mg is 12x -> well past the threshold.
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 2.5 }],
      tEndH: 24,
      dtH: 0.05,
    });
    const tox = result.toxicity!;
    expect(tox.failedOrgans.length).toBeGreaterThan(0);
    expect(tox.death).not.toBeNull();
    expect(tox.message).toContain('heart');
    expect(tox.message).toContain('illustrative');
    expect(tox.death!.organ).toBe('heart');
    expect(tox.death!.timeH).toBe(2.5);
  });

  it('organ load never stays below a failure load once that organ has failed', () => {
    const result = simulate({
      profile,
      drug: fixtureDrug,
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 0 }],
      tEndH: 24,
      dtH: 0.05,
    });
    for (const failure of result.toxicity!.failedOrgans) {
      expect(result.toxicity!.organLoad[failure.organ]).toBeGreaterThanOrEqual(FAILURE_THRESHOLD);
    }
  });

  it('skips doses whose lagged gut event falls outside the simulation', () => {
    const result = simulate({
      profile,
      drug: { ...fixtureDrug, tlag_h: 3 },
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 3 }],
      tEndH: 5,
    });
    expect(result.toxicity?.failedOrgans).toEqual([]);
    expect(result.toxicity?.death).toBeNull();
  });

  it('uses the exact lagged gut event time for the teaching signal', () => {
    const result = simulate({
      profile,
      drug: { ...fixtureDrug, tlag_h: 0.125 },
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 0.2 }],
      tEndH: 1,
    });
    expect(result.toxicity?.death?.timeH).toBe(0.325);
  });

  it('leaves the teaching score absent without a finite studied dose ceiling', () => {
    const result = simulate({
      profile,
      drug: { ...fixtureDrug, studied_dose_range_mg: null },
      doses: [{ drugId: fixtureDrug.id, doseMg: 6000, timeH: 0 }],
      tEndH: 24,
    });
    expect(result.toxicity).toBeUndefined();
  });

  it('an empty dose schedule never kills the model', () => {
    const result = simulate({ profile, drug: fixtureDrug, doses: [], tEndH: 24, dtH: 0.05 });
    expect(result.toxicity!.death).toBeNull();
    expect(result.toxicity!.failedOrgans).toHaveLength(0);
  });
});
