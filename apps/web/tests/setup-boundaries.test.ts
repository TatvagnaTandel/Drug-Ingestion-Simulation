import { describe, expect, it } from "vitest";
import {
  ageError, doseError, doseTimeError, weightError, windowError,
} from "../lib/setup-validation";
import { parsePrescription } from "../components/simulator/prescription";

describe("setup bounds", () => {
  it("does not interpret empty fields as zero and accepts the documented endpoints", () => {
    expect(ageError(1)).toBeNull();
    expect(ageError("120")).toBeNull();
    expect(ageError("")).toBeTruthy();
    expect(ageError(18.5)).toBeTruthy();
    expect(ageError(121)).toBeTruthy();
    expect(weightError(399.9)).toBeNull();
    expect(weightError("0")).toBeTruthy();
    expect(weightError(400)).toBeTruthy();
    expect(doseError(10000)).toBeNull();
    expect(doseError("")).toBeTruthy();
    expect(doseError(0)).toBeTruthy();
    expect(doseTimeError(0, 48)).toBeNull();
    expect(doseTimeError("", 48)).toBeTruthy();
    expect(doseTimeError(48.01, 48)).toBeTruthy();
    expect(windowError(96)).toBeNull();
    expect(windowError(96.01)).toBeTruthy();
  });

  it("bounds repeat intervals even for a single dose", () => {
    expect(parsePrescription("200 mg every 73 h for 1 dose").ok).toBe(false);
    expect(parsePrescription("200 mg every 72 h for 2 doses").ok).toBe(true);
  });
});
