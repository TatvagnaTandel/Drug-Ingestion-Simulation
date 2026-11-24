"use client";

import { useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { MAX_REPORT_DRUGS } from "@dib/data-client";
import { Search } from "lucide-react";
import {
  catalogueIsUnconfigured, getApprovedPk, OFFLINE_CATALOGUE_NOTICE, resolveCatalogueDrug,
  searchCatalogue, type CatalogueHit, type CatalogueSearch, type ResolvedDrug,
} from "@/lib/catalogue";
import { drugFromPk } from "@/lib/treatment";
import type { FieldReview } from "./form-validation";

function useCatalogueSearch(query: string, enabled: boolean) {
  const term = query.trim();
  const [response, setResponse] = useState<{ term: string; result: CatalogueSearch } | null>(null);
  const [offline, setOffline] = useState(catalogueIsUnconfigured);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (term.length < 2 || !enabled) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await searchCatalogue(term);
      if (current) {
        setResponse({ term, result });
        setOffline(result.offline);
      }
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, enabled, attempt]);

  const result = response?.term === term ? response.result : null;
  return {
    result, offline, markOffline: () => setOffline(true), term,
    busy: enabled && term.length >= 2 && !result,
    retry: () => {
      setResponse(null);
      setAttempt((n) => n + 1);
    },
  };
}

function CatalogueNotice({ offline, retry }: { offline: boolean; retry?: () => void }) {
  if (!offline) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      <p role="status">{OFFLINE_CATALOGUE_NOTICE}</p>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="rounded text-brand-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Retry live catalogue
        </button>
      ) : null}
    </div>
  );
}

export function MedicineSearch({
  selectedIds, issue, review, onAdd, examples,
}: {
  selectedIds: string[];
  issue: string | null;
  review: FieldReview;
  onAdd: (resolved: ResolvedDrug) => void;
  examples?: { label: string; medicines: { id: string; name: string }[] };
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [liveRanges, setLiveRanges] = useState<Record<string, CatalogueHit["doseRange"]>>({});
  const anchor = useRef<HTMLDivElement>(null);
  const full = selectedIds.length >= MAX_REPORT_DRUGS;
  const { result, offline, busy, retry, markOffline, term } = useCatalogueSearch(query, !full && !adding);
  const showResults = open && !full && !adding && Boolean(result?.hits.length);

  useEffect(() => {
    if (!showResults || !result || result.offline) return;
    let active = true;
    for (const hit of result.hits) {
      if (hit.pkStatus !== "reviewed") continue;
      void getApprovedPk(hit.id).then((pk) => {
        const range = pk && typeof pk !== "string" && drugFromPk(hit, pk)?.studied_dose_range_mg;
        if (active && range) setLiveRanges((ranges) => ({ ...ranges, [hit.id]: range }));
      });
    }
    return () => { active = false; };
  }, [result, showResults]);

  async function add({ id, name }: { id: string; name: string }, preferBundled = result?.offline) {
    if (adding || full || selectedIds.includes(id)) return;
    setOpen(false);
    setAddError(null);
    setAdding(true);
    const resolved = await resolveCatalogueDrug(id, name, preferBundled);
    setAdding(false);
    if (!resolved) {
      setAddError(`Could not load reviewed parameters for ${name}. Search again to retry.`);
      return;
    }
    setQuery("");
    if (resolved.offline) markOffline();
    onAdd(resolved);
  }

  const status = adding ? "Checking reviewed parameters…" : addError
    ?? (busy ? "Searching the catalogue…" : result?.hits.length === 0 ? "No matching medicines." : null);

  return (
    <div ref={anchor} className="relative">
      <Combobox.Root<CatalogueHit>
        items={result?.hits ?? []}
        filter={null}
        value={null}
        open={showResults}
        onOpenChange={setOpen}
        inputValue={query}
        itemToStringLabel={(hit) => hit.name}
        onInputValueChange={(next, details) => {
          if (details.reason !== "input-change") return;
          setQuery(next);
          setAddError(null);
          setOpen(true);
        }}
        onValueChange={(hit) => { if (hit) void add(hit); }}
        disabled={full}
        readOnly={adding}
      >
        <label htmlFor="drug-search" className="sr-only">Search medicine catalogue</label>
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Combobox.Input
            id="drug-search"
            className="theatre-field w-full pl-9!"
            placeholder={full ? "Medicine limit reached" : "Search medicine catalogue"}
            autoComplete="off"
            maxLength={80}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            {...review.props("drug-search", issue)}
          />
        </div>
        <Combobox.Portal container={anchor}>
          <Combobox.Positioner sideOffset={5} className="z-30 w-[var(--anchor-width)]">
            <Combobox.Popup className="rounded-lg border border-line-strong bg-surface shadow-[var(--elevation-float)]">
              <Combobox.List aria-label="Medicine search results" className="max-h-[min(16rem,var(--available-height))] overflow-y-auto">
                {(hit: CatalogueHit) => {
                  const already = selectedIds.includes(hit.id);
                  const range = hit.doseRange ?? liveRanges[hit.id];
                  const context = already ? "Added" : range ? `Studied range ${range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`} mg`
                    : hit.pkStatus === "reviewed" ? "Reviewed PK"
                    : hit.pkStatus === "partial" ? "Partial PK evidence" : "No sourced PK";
                  return (
                    <Combobox.Item
                      key={hit.id}
                      value={hit}
                      disabled={already || hit.pkStatus !== "reviewed"}
                      className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line px-3 py-2 text-sm text-ink last:border-b-0 data-disabled:cursor-not-allowed data-disabled:text-ink-3 data-highlighted:bg-surface-2 data-highlighted:underline"
                    >
                      <span className="min-w-0 break-words">{hit.name}</span>
                      <span className="font-mono text-xs text-ink-2">{context}</span>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {review.issue("drug-search", issue)}
      <CatalogueNotice
        offline={offline}
        retry={term.length >= 2 && !busy && !adding ? () => { retry(); setOpen(true); } : undefined}
      />
      {status ? <p role="status" className="mt-2 text-xs text-ink-2">{status}</p> : null}
      {examples?.medicines.length ? (
        <div className="mt-2">
          <p className="text-xs text-ink-2">Catalogue examples for {examples.label}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {examples.medicines.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                disabled={full || adding || selectedIds.includes(medicine.id)}
                onClick={() => void add(medicine, offline)}
                className="theatre-chip disabled:opacity-55"
              >
                {selectedIds.includes(medicine.id) ? "✓ " : "+ "}{medicine.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
