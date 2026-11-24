"use client";

import { useCallback, useId, useRef } from "react";
import {
  FastForward,
  Pause,
  Play,
  Rewind,
} from "lucide-react";

export type DialSource = "user" | "auto";

export type TimeDialProps = {
  /** Simulated window, in hours. */
  maxH: number;
  /** Current hour. */
  hours: number;
  /** Source distinguishes a visitor's move from the play loop's updates. */
  onHours: (next: number, source: DialSource) => void;
  playing: boolean;
  onTogglePlay: () => void;
  /** Playback multiplier, e.g. 0.5 / 1 / 2. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Optional peak marker. */
  tmaxH?: number | null;
  /** Freeze the timeline (e.g. model has died); full timeline stays usable. */
  disabled?: boolean;
  disabledReason?: string;
};

/** The only speeds the control can settle on. */
const SPEEDS = [0.25, 0.5, 1, 2] as const;
/** Space kept at each end of the strip for the handle. */
const GUTTER = 14;

function clamp(hours: number, maxH: number): number {
  if (!Number.isFinite(hours)) return 0;
  return hours < 0 ? 0 : hours > maxH ? maxH : hours;
}

/** Move to the next value in SPEEDS, holding at the ends of the range. */
function stepSpeed(speed: number, direction: -1 | 1): number {
  const current = SPEEDS.findIndex((candidate) => candidate >= speed);
  const at = current === -1 ? SPEEDS.length - 1 : current;
  const next = Math.min(SPEEDS.length - 1, Math.max(0, at + direction));
  return SPEEDS[next];
}

/** Small square icon button shared by the transport controls. */
function ControlButton({
  label,
  onClick,
  disabled,
  pressed,
  description,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-describedby={description}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-surface text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-95 motion-reduce:transition-none motion-reduce:transform-none"
    >
      {children}
    </button>
  );
}

export default function TimeDial({
  maxH,
  hours,
  onHours,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  tmaxH,
  disabled = false,
  disabledReason,
}: TimeDialProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const reasonId = useId();
  const showReason = disabled && Boolean(disabledReason);

  const safeHours = clamp(hours, maxH);
  const fraction = maxH > 0 ? safeHours / maxH : 0;
  const peakFraction =
    tmaxH != null && maxH > 0 ? clamp(tmaxH, maxH) / maxH : null;

  /** Convert a pointer's x position into a clamped hour on the strip. */
  const hoursFromPointer = useCallback(
    (clientX: number) => {
      const strip = stripRef.current;
      if (!strip) return 0;
      const rect = strip.getBoundingClientRect();
      const usable = Math.max(1, rect.width - GUTTER * 2);
      return clamp(((clientX - rect.left - GUTTER) / usable) * maxH, maxH);
    },
    [maxH]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      event.currentTarget.dataset.dragging = "true";
      onHours(hoursFromPointer(event.clientX), "user");
    },
    [disabled, hoursFromPointer, onHours]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onHours(hoursFromPointer(event.clientX), "user");
    },
    [disabled, hoursFromPointer, onHours]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const step = maxH > 48 ? 1 : maxH > 12 ? 0.5 : 0.25;
      let next: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = hours - step;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = hours + step;
      else if (event.key === "PageDown") next = hours - step * 4;
      else if (event.key === "PageUp") next = hours + step * 4;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = maxH;
      if (next === null) return;
      event.preventDefault();
      onHours(clamp(next, maxH), "user");
    },
    [disabled, hours, maxH, onHours]
  );

  return (
    <div className="w-full">
      {/* One compact row: controls, then the timeline bar and its readout. */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="lab-play-control relative inline-flex rounded"
            tabIndex={showReason ? 0 : undefined}
            aria-describedby={showReason ? reasonId : undefined}
            aria-label={showReason ? "Playback unavailable" : undefined}
            role={showReason ? "group" : undefined}
          >
            <ControlButton
              label={playing ? "Pause" : "Play"}
              pressed={playing}
              disabled={disabled}
              description={showReason ? reasonId : undefined}
              onClick={onTogglePlay}
            >
              {playing ? (
                <Pause aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </ControlButton>
            {showReason ? <span id={reasonId} role="tooltip" className="lab-play-tooltip">{disabledReason}</span> : null}
          </span>
          <ControlButton
            label="Slow down"
            disabled={disabled}
            onClick={() => onSpeedChange(stepSpeed(speed, -1))}
          >
            <Rewind aria-hidden="true" className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton
            label="Speed up"
            disabled={disabled}
            onClick={() => onSpeedChange(stepSpeed(speed, 1))}
          >
            <FastForward aria-hidden="true" className="h-3.5 w-3.5" />
          </ControlButton>
          <span className="min-w-7 text-center font-mono text-xs tabular-nums text-brand-text">
            {speed}x
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            ref={stripRef}
            data-dial-strip
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label="Simulation time"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={maxH}
            aria-valuenow={Number(safeHours.toFixed(2))}
            aria-valuetext={`T+${safeHours.toFixed(1)} hours of ${maxH} hours`}
            data-dial-value={safeHours.toFixed(2)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            className={`relative h-7 min-w-0 flex-1 touch-pan-y select-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              disabled ? "cursor-not-allowed opacity-50" : "cursor-ew-resize"
            }`}
            style={{ containerType: "inline-size" }}
          >
            {/* Peak marker: a static hairline, placed with a transform in the
                strip's own container units so it lines up with the handle. */}
            {peakFraction != null ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-1/2 h-3 w-px bg-brand-text/60"
                style={{
                  transform: `translate3d(calc(${GUTTER}px + (100cqw - ${GUTTER * 2}px) * ${peakFraction}), -50%, 0)`,
                }}
              />
            ) : null}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[14px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line-strong"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(fraction * 100).toFixed(2)}%` }}
              />
            </div>
            <span
              aria-hidden="true"
              className="sim-handle pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 rounded-full border-2 border-brand bg-ink"
              style={{ "--dial-x": fraction.toFixed(5) } as React.CSSProperties}
            />
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-brand-text">
            T+{safeHours.toFixed(1)} h / {maxH} h
          </span>
        </div>
      </div>

      {peakFraction != null && tmaxH != null ? (
        <p className="sr-only">The peak of the curve is at {tmaxH.toFixed(2)} hours.</p>
      ) : null}

    </div>
  );
}
