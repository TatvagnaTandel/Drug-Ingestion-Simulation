"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { formatHours, timeLabel, type PlaybackStage } from "./playback";

export type TimeDialProps = {
  maxH: number;
  hours: number;
  onHours: (hours: number) => void;
  onTogglePlay: () => void;
  playLabel: "Play" | "Pause" | "Resume" | "Replay";
  tmaxH?: number | null;
  cmax?: number;
  stages?: PlaybackStage[];
  onScrubbing?: (scrubbing: boolean) => void;
  showSpaceHint?: boolean;
};

const GUTTER = 14;

export default function TimeDial({ maxH, hours, onHours, onTogglePlay, playLabel, tmaxH, cmax, stages = [], onScrubbing, showSpaceHint = true }: TimeDialProps) {
  const clamp = (value: number) => Math.min(maxH, Math.max(0, value));
  const current = clamp(hours);
  const fraction = maxH > 0 ? current / maxH : 0;
  const PlayIcon = playLabel === "Pause" ? Pause : playLabel === "Replay" ? RotateCcw : Play;

  function seekPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 2 - GUTTER * 2);
    onHours(clamp((event.clientX - rect.left - 1 - GUTTER) / usable * maxH));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    onScrubbing?.(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = maxH > 48 ? 1 : maxH > 12 ? 0.5 : 0.25;
    const values: Record<string, number> = {
      ArrowLeft: current - step, ArrowDown: current - step,
      ArrowRight: current + step, ArrowUp: current + step,
      PageDown: current - step * 4, PageUp: current + step * 4,
      Home: 0, End: maxH,
    };
    if (!(event.key in values)) return;
    event.preventDefault();
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      const forward = event.key === "ArrowRight" || event.key === "ArrowUp";
      const checkpoint = forward
        ? stages.find(({ hours }) => hours > current)
        : [...stages].reverse().find(({ hours }) => hours < current);
      onHours(checkpoint?.hours ?? (forward ? maxH : 0));
    } else {
      onHours(clamp(values[event.key]));
    }
  }

  return (
    <div className="time-dial">
      <button type="button" data-playback-control onClick={onTogglePlay}
        className="theatre-button theatre-primary" aria-keyshortcuts="Space">
        <PlayIcon size={16} aria-hidden="true" /> {playLabel}
      </button>
      <div className="time-dial-track">
        <div className="time-dial-labels"><span>0 h</span><output aria-live="off">{timeLabel(current).replace(/^at /, "")}</output><span>{maxH} h</span></div>
        <div role="slider" data-dial-strip tabIndex={0} aria-label="Simulated time, in hours"
          aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={maxH}
          aria-valuenow={current} aria-valuetext={timeLabel(current)}
          data-dial-value={formatHours(current)} onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            onScrubbing?.(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus();
            seekPointer(event);
          }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekPointer(event); }}
          onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="time-dial-rail" aria-hidden="true">
            <div className="time-dial-fill" style={{ width: `${fraction * 100}%` }} />
            {stages.map(({ label, hours: stageHour }) => (
              <span key={label} className="time-dial-tick" title={`${label} · ${timeLabel(stageHour)}`} style={{ left: `${stageHour / maxH * 100}%` }} />
            ))}
            {tmaxH != null ? <span className="time-dial-tick time-dial-peak" title={`Peak · ${cmax == null ? "" : `${cmax.toFixed(3)} mg/L `}${timeLabel(tmaxH)}`} style={{ left: `${tmaxH / maxH * 100}%` }} /> : null}
            <span className="time-dial-thumb" style={{ left: `${fraction * 100}%` }} />
          </div>
        </div>
        <div className="time-dial-caption">
          <span>{tmaxH == null ? "Simulated time" : `Peak ${cmax == null ? "" : `${cmax.toFixed(3)} mg/L `}${timeLabel(tmaxH)}`}</span>
          {showSpaceHint ? <span>Press <kbd>Space</kbd> to pause or resume</span> : null}
        </div>
      </div>
    </div>
  );
}
