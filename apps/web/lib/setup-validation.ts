function numeric(value: string | number): number {
  return typeof value === "string" && !value.trim() ? NaN : Number(value);
}

export function ageError(value: string | number): string | null {
  const age = numeric(value);
  return Number.isInteger(age) && age >= 1 && age <= 120 ? null : "Enter a whole age from 1 to 120 years.";
}

export function weightError(value: string | number): string | null {
  const weight = numeric(value);
  return weight > 0 && weight < 400 ? null : "Enter a weight above 0 and below 400 kg.";
}

export function doseError(value: string | number): string | null {
  const dose = numeric(value);
  return dose > 0 && dose <= 10_000 ? null : "Enter a dose above 0 and at most 10,000 mg.";
}

export function doseTimeError(value: string | number, window: number): string | null {
  const time = numeric(value);
  return time >= 0 && time <= window ? null : `Enter a dose time from 0 to ${window} h.`;
}

export function windowError(value: number): string | null {
  return value >= 1 && value <= 96 ? null : "Choose a window from 1 to 96 hours.";
}
