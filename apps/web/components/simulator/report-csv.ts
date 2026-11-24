import type { MedicationRun } from "@/lib/treatment";

function csvText(value: string): string {
  // Spreadsheet applications interpret leading operators as formulas.
  const cell = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return /[,\r\n"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function serializeTimeSeries(runs: MedicationRun[]): string {
  const columns = "medicine_id,medicine_name,time_h,central_concentration_mg_per_l,gut_amount_mg,central_amount_mg,total_elimination_mg_per_h";
  const rows = runs.flatMap(({ id, name, result }) => {
    const medicine = `${csvText(id)},${csvText(name)}`;
    return result.tH.map((time, index) => [
      medicine,
      time,
      result.concMgPerL[index],
      result.gutMg[index],
      result.bodyMg[index],
      result.eliminationMgPerH[index],
    ].join(","));
  });
  return [columns, ...rows].join("\r\n") + "\r\n";
}
