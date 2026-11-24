"use client";

import { useId, useState, type FocusEvent, type ReactNode } from "react";

export function useFieldReview() {
  const [blurred, setBlurred] = useState<Set<string>>(() => new Set());
  const [attempted, setAttempted] = useState(false);
  const show = (id: string, error: string | null) => attempted || blurred.has(id) ? error : null;
  return {
    attempted,
    attempt: () => setAttempted(true),
    blur: (event: FocusEvent<HTMLFormElement>) => {
      const { id } = event.target;
      if (id) setBlurred((current) => current.has(id) ? current : new Set(current).add(id));
    },
    props: (id: string, error: string | null) => show(id, error)
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-issue` }
      : {},
    issue: (id: string, error: string | null) => {
      const message = show(id, error);
      return message ? <FieldIssue id={`${id}-issue`}>{message}</FieldIssue> : null;
    },
  };
}

export type FieldReview = ReturnType<typeof useFieldReview>;

export function FieldIssue({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} role="alert" className="mt-1 flex gap-1.5 text-xs leading-4 text-warn">
      <span aria-hidden="true" className="font-bold">⚠</span>{children}
    </p>
  );
}

export function RunButton({
  reason, attempted, busy, children,
}: {
  reason: string | null;
  attempted: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  const feedbackId = useId();
  const feedback = busy ? "Preparing the simulation…" : attempted ? reason : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          aria-disabled={Boolean(busy || reason)}
          aria-busy={busy || undefined}
          aria-describedby={feedback ? feedbackId : undefined}
          className="theatre-button theatre-primary aria-disabled:opacity-75"
        >
          Run and play
        </button>
        {children}
      </div>
      {feedback ? <p id={feedbackId} role="status" className="mt-2 text-xs text-ink-2">{feedback}</p> : null}
    </div>
  );
}
