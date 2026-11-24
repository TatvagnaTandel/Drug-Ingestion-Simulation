"use client";

/**
 * The model viewport: the canvas the anatomy is drawn on, with the HUD
 * furniture around it.
 *
 * React owns the canvas and the overlays; the Three.js scene is imported
 * lazily so `three` never lands in the first payload and never runs during
 * SSR.
 *
 * The overlays use the scene’s render callbacks, so moving the camera and
 * pointing at the brain never cause a React render.
 */

import { useEffect, useRef } from "react";
import { useAnatomyViewport, ViewportFallback } from "@/components/anatomy/viewport-fallback";
import type { SceneStatus } from "@/components/anatomy/viewport-runtime";
import type { BrainRegion } from "@/components/anatomy/regions";
import type { SimulatorScene } from "./scene";

export type { SceneStatus } from "@/components/anatomy/viewport-runtime";

type BodyFigureProps = {
  /** The live scene, for the overlays. */
  scene: SimulatorScene | null;
  /** The current dose route segment, shown over the model. */
  stageLabel: string | null;
  /** Hands the scene to the parent so it can drive it. */
  onScene?: (scene: SimulatorScene | null) => void;
  onStatus?: (status: SceneStatus) => void;
  /** The brain region under the pointer. */
  onBrainRegion?: (region: BrainRegion | null) => void;
  className?: string;
};

export default function BodyFigure({
  scene,
  stageLabel,
  onScene,
  onStatus,
  onBrainRegion,
  className = "",
}: BodyFigureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onBrainRegionRef = useRef(onBrainRegion);

  useEffect(() => {
    onBrainRegionRef.current = onBrainRegion;
  }, [onBrainRegion]);

  const { attempt, status, retry } = useAnatomyViewport(canvasRef, async (canvas, onStatus, signal) => {
    const { createSimulatorScene } = await import("./scene");
    if (signal.aborted) return null;
    return createSimulatorScene(canvas, {
      onStatus,
      onBrainRegion: (region) => onBrainRegionRef.current?.(region),
    });
  }, onScene);

  useEffect(() => { onStatus?.(status); }, [onStatus, status]);

  /* The label over the focused organ ---------------------------------- */

  const brainRef = useRef<HTMLDivElement | null>(null);
  const brainLabelRef = useRef<HTMLSpanElement | null>(null);
  const brainPartRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!scene) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let bx = 0;
    let by = 0;
    let started = false;

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // The brain readout.
      const brainBox = brainRef.current;
      const brainLabel = brainLabelRef.current;
      const brainPart = brainPartRef.current;
      if (!brainBox || !brainLabel || !brainPart) return;

      const hit = scene.getBrainRegion();
      if (!hit) {
        brainBox.style.opacity = "0";
        return;
      }
      if (!started) {
        bx = hit.x;
        by = hit.y;
        started = true;
      } else if (motion.matches) {
        bx = hit.x;
        by = hit.y;
      } else {
        bx += (hit.x - bx) * 0.25;
        by += (hit.y - by) * 0.25;
      }
      if (brainLabel.textContent !== hit.region.display) {
        brainLabel.textContent = hit.region.display;
      }
      if (brainPart.textContent !== hit.region.part) {
        brainPart.textContent = hit.region.part;
      }
      const width = canvas.clientWidth || 0;
      const height = canvas.clientHeight || 0;
      const boxWidth = brainBox.offsetWidth || 220;
      const boxHeight = brainBox.offsetHeight || 24;
      const left = width ? Math.max(4, Math.min(bx + 14, width - boxWidth - 4)) : bx + 14;
      const top = height
        ? Math.max(4, Math.min(by - boxHeight - 10, height - boxHeight - 4))
        : by - boxHeight - 10;
      brainBox.style.opacity = "1";
      brainBox.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    };

    return scene.subscribeFrame(tick);
  }, [scene]);

  return (
    <div className={`absolute inset-0 ${className}`} data-anatomy-status={status}>
      <canvas
        key={attempt}
        ref={canvasRef}
        aria-hidden={status !== "ready"}
        role="img"
        aria-label="See-through anatomy with an animated capsule and a gold trail showing the dose route."
        className="absolute inset-0 block h-full w-full touch-pan-y select-none"
      />

      {status === "ready" && stageLabel ? (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-line-strong bg-page/90 px-2.5 py-1.5 text-xs font-medium text-ink">
            {stageLabel}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-line bg-page/90 px-2.5 py-1.5 text-xs text-ink-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-amber-300" />
            Illustrative route of the first dose
          </div>
        </>
      ) : null}

      {/* The part of the brain under the pointer. */}
      <div
        ref={brainRef}
        hidden={status !== "ready"}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-10 max-w-[min(280px,calc(100%-8px))] truncate rounded-[4px] border border-line-strong bg-page/85 px-2 py-1 font-mono text-xs uppercase leading-4 tracking-[0.12em] text-brand-text backdrop-blur-sm"
        style={{ opacity: 0, transform: "translate3d(0px, 0px, 0)" }}
      >
        <span ref={brainLabelRef} className="block truncate" />
        <span ref={brainPartRef} className="block truncate normal-case tracking-normal text-ink-2" />
      </div>

      <ViewportFallback status={status} retry={retry} />
    </div>
  );
}
