import type { PlaybackStage } from "./playback";

export const PREVIEW_STAGES = [
  "Swallow", "Absorption", "Portal circulation", "Right heart", "Lungs",
  "Left heart", "Brain", "Liver clearance", "Kidneys",
];

export default function JourneyRail({ stages, index, onSelect }: {
  stages?: PlaybackStage[];
  index?: number;
  onSelect?: (step: number) => void;
}) {
  const entries = stages?.map(({ label }) => label) ?? PREVIEW_STAGES;
  return (
    <nav className="journey-rail" aria-label="Dose journey">
      <h2 className="theatre-eyebrow">The journey</h2>
      <ol>
        {entries.map((label, i) => {
          const state = index === i ? "current" : index !== undefined && index > i ? "past" : "ahead";
          const marker = stages && i === stages.length - 1 ? "✓" : String(i + 1).padStart(2, "0");
          const item = <><span className="journey-marker" aria-hidden="true">{marker}</span><span>{label}{state === "past" ? <span className="sr-only"> (completed)</span> : null}</span></>;
          return (
            <li key={label} data-state={state}>
              {onSelect ? (
                <button type="button" aria-current={state === "current" ? "step" : undefined} onClick={() => onSelect(i)}>{item}</button>
              ) : <span className="journey-preview-item">{item}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
