import type { DrugCatalogHit, DrugParameterCitation, DrugPkRow } from "@dib/data-client";
import type { Drug } from "@dib/engine";
import snapshot from "../../../data/drugs.json";
import { getBrowserDataClient } from "./browser-data-client";
import { drugFromPk } from "./treatment";

export type CatalogueHit = DrugCatalogHit & { doseRange?: NonNullable<Drug["studied_dose_range_mg"]> };
export type CatalogueSearch = { hits: CatalogueHit[]; offline: boolean };
export type CataloguePk = DrugPkRow;
export type CatalogueCitation = DrugParameterCitation;

const DEADLINE_MS = 8_000;
const ID = /^[a-z0-9][a-z0-9 ()/+-]{0,99}$/i;
const bundled = snapshot.flatMap((row): Drug[] => {
  const { route, model } = row;
  const [min, max] = row.studied_dose_range_mg;
  if (route !== "oral" || model !== "one-compartment" || !(min > 0 && max >= min)) return [];
  return [{ ...row, route, model, studied_dose_range_mg: [min, max] }];
});
export const OFFLINE_CATALOGUE_NOTICE = `Offline catalogue · ${bundled.length} medicines with published parameters`;

function withinDeadline<T>(request: Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), DEADLINE_MS);
    request.then(resolve, () => resolve(null)).finally(() => clearTimeout(timer));
  });
}

export const catalogueIsUnconfigured = () => getBrowserDataClient() === null;

export async function searchCatalogue(rawQuery: string, limit = 12): Promise<CatalogueSearch> {
  const q = rawQuery.trim().slice(0, 80);
  const client = getBrowserDataClient();
  if (q.length < 2) return { hits: [], offline: !client };
  const response = client && await withinDeadline(client.drugs.searchDrugs(q, limit));
  if (response?.data && !response.error) return { hits: response.data, offline: false };

  const term = q.toLowerCase();
  return {
    hits: bundled.filter((drug) => drug.name.toLowerCase().includes(term)).slice(0, limit)
      .map(({ id, name, studied_dose_range_mg }) => ({
        id, name, routes: ["oral"], pkStatus: "reviewed", productCount: 0,
        doseRange: studied_dose_range_mg ?? undefined,
      })),
    offline: true,
  };
}

export async function getApprovedCitations(
  rawId: string,
): Promise<CatalogueCitation[] | "error" | "unconfigured"> {
  const id = rawId.trim();
  if (!ID.test(id)) return "error";
  const client = getBrowserDataClient();
  if (!client) return "unconfigured";
  const response = await withinDeadline(client.drugs.getDrugCitations(id));
  return !response || response.error ? "error" : response.data ?? [];
}

export async function getApprovedPk(rawId: string): Promise<CataloguePk | null | "error" | "unconfigured"> {
  const id = rawId.trim();
  if (!ID.test(id)) return "error";
  const client = getBrowserDataClient();
  if (!client) return "unconfigured";
  const response = await withinDeadline(client.drugs.getDrugPk(id));
  return !response || response.error ? "error" : response.data;
}

export type ResolvedDrug = { drug: Drug; citations: CatalogueCitation[]; offline: boolean };

export async function resolveCatalogueDrug(
  rawId: string, name?: string, preferBundled = false,
): Promise<ResolvedDrug | null> {
  const id = rawId.trim();
  const bundledDrug = bundled.find((drug) => drug.id === id);
  const fallback = bundledDrug ? { drug: bundledDrug, citations: [], offline: true } : null;
  if (preferBundled && fallback) return fallback;
  const [pk, citations] = await Promise.all([getApprovedPk(id), getApprovedCitations(id)]);
  if (typeof pk === "string") return fallback;
  const drug = pk && drugFromPk({ id, name: name ?? bundledDrug?.name ?? id }, pk);
  return drug ? { drug, citations: Array.isArray(citations) ? citations : [], offline: false } : null;
}
