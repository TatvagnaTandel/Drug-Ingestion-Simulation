"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { RotateCcw } from "lucide-react";
import type { SceneStatus } from "./viewport-runtime";

const MODEL_DEADLINE_MS = 10_000;
const STATIC_ANATOMY = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/anatomy-theatre.webp`;

type Scene = { dispose(): void };

export function useAnatomyViewport<T extends Scene>(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  create: (canvas: HTMLCanvasElement, onStatus: (status: SceneStatus) => void, signal: AbortSignal) => Promise<T | null>,
  onScene?: (scene: T | null) => void,
) {
  const handlers = useRef({ create, onScene });
  const previousCanvas = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<SceneStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { handlers.current = { create, onScene }; }, [create, onScene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Next's Activity can restore the same DOM canvas after cleanup released its WebGL context.
    if (canvas === previousCanvas.current) {
      setStatus("loading");
      setAttempt((current) => current + 1);
      return;
    }
    previousCanvas.current = canvas;
    let scene: T | null = null;
    const abort = new AbortController();
    let cancelled = false;
    let failed = false;
    const timeout = window.setTimeout(() => finish("error"), MODEL_DEADLINE_MS);

    function finish(next: SceneStatus) {
      if (cancelled || failed || next === "loading") return;
      window.clearTimeout(timeout);
      if (next === "error") {
        failed = true;
        abort.abort();
        scene?.dispose();
        scene = null;
        handlers.current.onScene?.(null);
      }
      setStatus(next);
    }

    void handlers.current.create(canvas, finish, abort.signal).then((created) => {
      if (cancelled || failed) {
        created?.dispose();
        return;
      }
      scene = created;
      handlers.current.onScene?.(created);
    }).catch(() => finish("error"));

    return () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(timeout);
      scene?.dispose();
      handlers.current.onScene?.(null);
    };
  }, [attempt, canvasRef]);

  return {
    attempt,
    status,
    retry() {
      setStatus("loading");
      setAttempt((current) => current + 1);
    },
  };
}

export function ViewportFallback({ status, retry }: { status: SceneStatus; retry: () => void }) {
  if (status === "ready") return null;
  return (
    <>
      {status === "error" ? (
        // eslint-disable-next-line @next/next/no-img-element -- locally optimized transparent WebP.
        <img
          className="pointer-events-none absolute inset-0 h-full w-full object-contain p-3 opacity-70"
          src={STATIC_ANATOMY}
          alt="Static full-body anatomical illustration"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
        <div className="max-w-full rounded-lg border border-line-strong bg-page px-3 py-2 text-center text-sm text-ink">
          <p role="status">
            {status === "loading" ? "Loading anatomy…" : "3D anatomy unavailable. You can still use the timeline and readouts."}
          </p>
          {status === "error" ? (
            <button
              type="button"
              onClick={retry}
              className="pointer-events-auto mx-auto mt-2 flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
