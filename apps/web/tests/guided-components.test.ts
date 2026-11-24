import { Children, createElement, isValidElement, type KeyboardEvent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { simulate } from "@dib/engine";
import { STUDY_CASES } from "../lib/study-cases";
import BodyFigure from "../components/simulator/body-figure";
import OrganDetail from "../components/simulator/organ-detail";
import RunResults, { ModelChart } from "../components/simulator/run-results";
import TimeDial from "../components/simulator/time-dial";
import { buildStages, playbackAt } from "../components/simulator/playback";
import { reportDisclaimers, reportMetrics, type ReportData } from "../components/simulator/report-data";

vi.mock("../components/simulator/body-figure", () => ({
  default: ({ stageLabel }: { stageLabel: string }) => createElement("div", { "data-webgl-stage": stageLabel }),
}));

const study = STUDY_CASES[0];
const line = study.input.drugs[0];
const result = simulate({
  profile: { ageYears: 30, weightKg: 70, sex: "other" },
  drug: line.drug,
  doses: line.doses.map((dose) => ({ ...dose, drugId: line.drug.id })),
  tEndH: study.input.tEndH,
});
const run = { id: line.drug.id, name: line.drug.name, color: "#ffc18a", result };
const runs = [run];
const stages = buildStages(result, line.doses.map(({ timeH }) => timeH));
const data: ReportData = {
  active: study.input, runs, primaryRun: run, stages, study, treatmentLabel: run.name, isExample: false,
};

type SlideProperties = {
  role?: string;
  children?: ReactNode;
  onKeyDown?: (event: Pick<KeyboardEvent<HTMLDivElement>, "key" | "preventDefault">) => void;
};

function sliderKeyHandler(children: ReactNode): SlideProperties["onKeyDown"] {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<SlideProperties>(child)) continue;
    if (child.props.role === "slider") return child.props.onKeyDown;
    const nested = sliderKeyHandler(child.props.children);
    if (nested) return nested;
  }
}

describe("guided simulation components", () => {
  it("keeps the slider, stage, chart, and WebGL target synchronized at an off-grid time", () => {
    const hours = 8.99;
    const { index, holding } = playbackAt(stages, hours);
    const stage = stages[index];
    const seek = vi.fn();
    const dial = TimeDial({ maxH: 48, hours, onHours: seek, onTogglePlay: vi.fn(), playLabel: "Resume" });
    const keyDown = sliderKeyHandler(dial);
    expect(keyDown).toBeTypeOf("function");
    const preventDefault = vi.fn();
    keyDown?.({ key: "ArrowRight", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(9.49);
    keyDown?.({ key: "End", preventDefault });
    expect(seek).toHaveBeenLastCalledWith(48);
    expect(preventDefault).toHaveBeenCalledTimes(2);

    const markup = renderToStaticMarkup(createElement("div", null,
      dial,
      createElement(BodyFigure, { stageLabel: stage.label, scene: null, onScene: vi.fn(), onStatus: vi.fn() }),
      createElement(OrganDetail, { stage, moment: result.at(hours), holding, playing: false }),
      createElement(ModelChart, { runs, hours }),
    ));
    expect(markup).toContain('aria-valuenow="8.99"');
    expect(markup).toContain('data-webgl-stage="Liver clearance"');
    expect(markup).toContain("At the current simulation time");
    expect(markup).toContain('data-curve-time="true">at t = 8.99 h');
    expect(markup.match(/7\.240 mg\/L/g)).toHaveLength(2);

    const checkpoint = stages.find(({ route }) => route === "liver");
    expect(checkpoint?.hours).toBeCloseTo(8.992, 10);
    if (!checkpoint) throw new Error("Expected a liver clearance checkpoint");
    const checkpointMarkup = renderToStaticMarkup(createElement(OrganDetail, {
      stage: checkpoint, moment: result.at(checkpoint.hours), holding: true, playing: false,
    }));
    expect(checkpointMarkup).toContain("At the current simulation time");
    expect(checkpointMarkup).toContain("7.238 mg/L");
  });

  it("presents distinct model series, metrics, formulas, citations, and educational disclaimer", () => {
    const markup = renderToStaticMarkup(createElement(RunResults, {
      ...data, pdf: { filename: "study-report.pdf", url: "blob:pdf", error: false, retry: vi.fn() }, onReplay: vi.fn(),
    }));
    expect(markup.match(/<figure/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Shared by Heart, Lungs, Brain"');
    expect(markup).toContain("Amount in the gut · mg");
    expect(markup).toContain("Total model elimination · mg/h");
    expect(markup).toContain("How this is computed");
    expect(markup).toContain('download="study-report.pdf"');
    expect(markup).toContain("Preparing CSV");
    expect(markup).not.toContain("Time above threshold");
    for (const { label, value } of reportMetrics(result)) {
      expect(markup).toContain(label);
      expect(markup).toContain(value);
    }
    for (const { url } of study.references) {
      expect(markup).toContain(url);
    }
    for (const disclaimer of reportDisclaimers(data)) {
      expect(markup).toContain(disclaimer);
    }
  });
});
