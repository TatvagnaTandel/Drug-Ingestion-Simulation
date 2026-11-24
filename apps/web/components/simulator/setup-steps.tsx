import { X } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_REPORT_DRUGS } from "@dib/data-client";
import { ageError, doseError, doseTimeError, weightError, windowError } from "@/lib/setup-validation";
import { EXAMPLE_BANNER } from "@/lib/example-drug";

type Medicine = { id: string; name: string };
type SummaryMedicine = Medicine & { doses: readonly { doseMg: string | number; timeH: string | number }[] };

const titles = ["Medicines", "Person", "Window and run"] as const;

export function SetupStep({ number, children }: { number: 1 | 2 | 3; children: ReactNode }) {
  return (
    <section className="theatre-card min-w-0 space-y-3">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full border border-[var(--peach)] font-mono text-xs text-ink-2">
          {number}
        </span>
        <h3 className="font-[family-name:var(--theatre-serif)] text-[1.55rem] font-normal leading-none text-ink">{titles[number - 1]}</h3>
      </div>
      {children}
    </section>
  );
}

export function MedicineChips({ medicines, onRemove }: { medicines: Medicine[]; onRemove: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {medicines.length ? (
        <ul aria-label="Selected medicines" className="flex min-w-0 flex-wrap gap-1.5">
          {medicines.map(({ id, name }) => (
            <li key={id} className="min-w-0">
              <button
                type="button"
                className="theatre-chip max-w-full cursor-pointer hover:border-[var(--peach)]"
                onClick={() => onRemove(id)}
                aria-label={`Remove ${name}`}
              >
                <span className="break-words text-left">{name}</span>
                <X size={14} className="shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="ml-auto shrink-0 font-mono text-xs text-ink-2">{medicines.length} of {MAX_REPORT_DRUGS} medicines</p>
    </div>
  );
}

export function SyntheticSetupNotice() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
      <span className="theatre-chip text-warn">Synthetic example</span>
      <p>{EXAMPLE_BANNER}</p>
    </div>
  );
}

const sexLabels = { "": "Sex unspecified", female: "Female", male: "Male", other: "Other" };

export function SetupSummary({
  medicines, age, weight, sex, hours,
}: {
  medicines: SummaryMedicine[];
  age: string | number;
  weight: string | number;
  sex: keyof typeof sexLabels;
  hours: number;
}) {
  const person = [
    ageError(age) ? "Age pending" : `${age} years`,
    weightError(weight) ? "Weight pending" : `${weight} kg`,
    sexLabels[sex],
  ].join(" · ");
  return (
    <div role="status" aria-label="Setup summary" className="rounded-lg border border-line bg-surface p-3 text-xs text-ink-2">
      <p className="mb-2 font-medium text-ink">Setup summary</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        <div>
          <dt className="font-mono text-ink-3">Medicines</dt>
          {medicines.length ? medicines.map(({ id, name, doses }) => {
            const first = doses[0];
            const ready = first && !doseError(first.doseMg) && !doseTimeError(first.timeH, hours);
            const dose = doses.length > 1 ? `${doses.length} doses`
              : ready ? `${first.doseMg} mg at ${first.timeH} h` : "Dose pending";
            return <dd key={id} className="break-words">{name} · {dose}</dd>;
          }) : <dd>No medicines selected</dd>}
        </div>
        <div>
          <dt className="font-mono text-ink-3">Person</dt>
          <dd>{person}</dd>
        </div>
        <div>
          <dt className="font-mono text-ink-3">Window</dt>
          <dd>{windowError(hours) ? "Window pending" : `${hours} h`}</dd>
        </div>
      </dl>
    </div>
  );
}
