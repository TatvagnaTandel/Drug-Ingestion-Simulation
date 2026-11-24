import { ChevronDown } from "lucide-react";
import type { SimMoment } from "./condition";
import { ROUTE_COPY, type DoseRoute, type PlaybackStage } from "./playback";

const circulation = "https://www.nhlbi.nih.gov/health/heart/blood-flow";
const digestion = "https://www.niddk.nih.gov/health-information/digestive-diseases/digestive-system-how-it-works";
const kidneys = "https://www.niddk.nih.gov/health-information/kidney-disease/kidneys-how-they-work";

const DETAILS: Record<DoseRoute, { title: string; detail: string; reading: string; source: string }> = {
  swallow: {
    title: "Arrival in the stomach",
    detail: "Muscular contractions move the swallowed dose down the esophagus. The stomach gradually passes its contents into the small intestine.",
    reading: "The gut amount tracks the oral dose available for absorption in this model.",
    source: digestion,
  },
  absorption: {
    title: "Entering the circulation",
    detail: "The small intestine offers a large surface for absorption. The model's absorption constant controls how quickly drug leaves the gut compartment.",
    reading: "As gut amount falls, absorbed drug adds to the central amount.",
    source: digestion,
  },
  portal: {
    title: "The first pass",
    detail: "Absorbed drug travels through portal blood to the liver. The fraction reaching systemic circulation depends on the medicine.",
    reading: "Bioavailability is included in the model inputs. This view shows the route through the liver.",
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11957910/",
  },
  "right-heart": {
    title: "Preparing for pulmonary flow",
    detail: "Venous blood enters the right atrium, then the right ventricle. The next contraction sends it toward the lungs.",
    reading: "Concentration describes the model's central compartment as drug circulates.",
    source: circulation,
  },
  lungs: {
    title: "Through both lungs",
    detail: "Pulmonary arteries branch toward both lungs. Blood gains oxygen here and returns through the pulmonary veins.",
    reading: "The displayed concentration is the central model value. Lung tissue concentration would need a separate model.",
    source: circulation,
  },
  "left-heart": {
    title: "Out to the body",
    detail: "Blood returns to the left atrium and passes into the left ventricle. The ventricle pumps it into the aorta.",
    reading: "Central amount is the modeled mass of drug in the systemic compartment.",
    source: circulation,
  },
  brain: {
    title: "Arterial supply to the brain",
    detail: "This branch follows blood toward the brain. Entry into brain tissue depends on the medicine's ability to cross the blood–brain barrier.",
    reading: "This is a systemic concentration checkpoint. Brain exposure requires additional drug-specific parameters.",
    source: "https://pubmed.ncbi.nlm.nih.gov/27020469/",
  },
  body: {
    title: "Distribution to tissues",
    detail: "The aorta divides into arteries supplying tissues across the body. Circulation repeatedly carries drug through these branches.",
    reading: "Distribution volume connects central amount and concentration in the model.",
    source: circulation,
  },
  liver: {
    title: "Following clearance",
    detail: "The liver receives circulating drug again. Metabolism and its contribution to clearance depend on the medicine.",
    reading: "Elimination rate combines clearance in this model. The input data determine the overall rate.",
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11957910/",
  },
  kidneys: {
    title: "The renal circulation",
    detail: "Blood reaches the kidneys through the renal arteries. Nephrons filter blood, recover needed substances and move wastes into urine.",
    reading: "This last checkpoint shows the remaining central amount and total modeled elimination rate.",
    source: kidneys,
  },
};

export function MomentValues({ moment }: { moment: SimMoment }) {
  const figures = [
    ["Concentration", `${moment.concMgPerL.toFixed(3)} mg/L`],
    ["In the gut", `${moment.gutMg.toFixed(1)} mg`],
    ["Central amount", `${moment.bodyMg.toFixed(1)} mg`],
    ["Elimination rate", `${moment.eliminationMgPerH.toFixed(2)} mg/h`],
  ];
  return (
    <div className="mt-4" data-live-values>
      <p className="text-xs text-ink-2">Now · At the current simulation time</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3">
        {figures.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-brand-text">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function OrganDetail({ stage, moment, holding, playing, scrubbing = false }: {
  stage: PlaybackStage;
  moment: SimMoment;
  holding: boolean;
  playing: boolean;
  scrubbing?: boolean;
}) {
  if (!stage.route) return null;
  const info = DETAILS[stage.route];
  if (scrubbing) return <p className="theatre-stage-summary">{stage.label} · {ROUTE_COPY[stage.route]}</p>;
  return (
    <article className="organ-detail" data-organ-panel="current" data-phase={holding ? "holding" : "travel"}>
      <p className="text-xs font-medium text-brand-text" role="status">
        {holding ? "Checkpoint reached" : playing ? "Travelling" : "Travel paused"}
      </p>
      <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{stage.label}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{ROUTE_COPY[stage.route]}</p>
      <MomentValues moment={moment} />
      {holding ? (
        <details className="theatre-disclosure mt-3">
          <summary>{info.title}<ChevronDown size={14} aria-hidden="true" /></summary>
          <p className="mt-1.5 text-xs leading-5 text-ink-2">{info.detail}</p>
          <p className="mt-2 text-xs leading-5 text-ink-3">{info.reading}</p>
          <a href={info.source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-text underline underline-offset-4">Read the source</a>
        </details>
      ) : null}
    </article>
  );
}
