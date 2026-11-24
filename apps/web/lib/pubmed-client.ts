/**
 * PubMed, called straight from the browser.
 *
 * The strip needs a handful of field-tagged queries — the fixed topic
 * queries and one drug query whose name comes from the catalogue. NCBI's
 * E-utilities is a public endpoint with open CORS (`esearch`/`esummary`),
 * so the static site can call it directly; there is no server in the loop,
 * and nothing here lets the request carry visitor-typed search text.
 *
 * The module caches per tab and spaces requests to respect NCBI's
 * anonymous limit when several walkthrough sections become visible.
 */

import {
  drugTopicQuery,
  pubmedSearchIds,
  pubmedSummaryArticles,
  TOPIC_QUERIES,
  topicForOrgan,
  type LiteratureResult,
  type LiteratureTopic,
} from "./pubmed";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "dib-literature-strip";
const SEARCH_HITS = 6;

export type DrugLiterature = {
  label: string | null;
  articles: LiteratureResult["articles"];
  error: "pubmed-unreachable" | "bad-drug-name" | null;
};

type Articles = LiteratureResult["articles"];
const cache = new Map<string, Promise<Articles>>();
const LOOKUP_TIMEOUT_MS = 8000;
let nextRequest = Promise.resolve();

function requestSlot(): Promise<void> {
  const slot = nextRequest;
  nextRequest = slot.then(() => new Promise((resolve) => setTimeout(resolve, 350)));
  return slot;
}

async function getJson(url: URL, signal: AbortSignal): Promise<unknown> {
  await requestSlot();
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`PubMed returned ${response.status}`);
  return await response.json();
}

function cached(key: string, load: (signal: AbortSignal) => Promise<Articles>): Promise<Articles> {
  const hit = cache.get(key);
  if (hit) return hit;
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const pending = new Promise<Articles>((resolve, reject) => {
    const onTimeout = () => reject(signal.reason);
    signal.addEventListener("abort", onTimeout, { once: true });
    load(signal).then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onTimeout);
    });
  }).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

async function articlesForQuery(query: string, signal: AbortSignal): Promise<LiteratureResult["articles"]> {
  const searchUrl = new URL(`${EUTILS}/esearch.fcgi`);
  searchUrl.search = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: String(SEARCH_HITS),
    sort: "relevance",
    tool: TOOL,
  }).toString();
  const pmids = pubmedSearchIds(await getJson(searchUrl, signal));
  if (pmids.length === 0) return [];
  const summaryUrl = new URL(`${EUTILS}/esummary.fcgi`);
  summaryUrl.search = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "json",
    tool: TOOL,
  }).toString();
  const summary = await getJson(summaryUrl, signal);
  return pubmedSummaryArticles(summary);
}

export async function fetchTopicLiterature(
  requested: string,
): Promise<{ label: string; articles: LiteratureResult["articles"]; error: "pubmed-unreachable" | null }> {
  const valid = Object.keys(TOPIC_QUERIES) as LiteratureTopic[];
  const topic: LiteratureTopic = valid.includes(requested as LiteratureTopic)
    ? (requested as LiteratureTopic)
    : topicForOrgan(null);
  try {
    const articles = await cached(`topic:${topic}`, (signal) => articlesForQuery(TOPIC_QUERIES[topic], signal));
    return { label: topic, articles, error: null };
  } catch {
    return { label: topic, articles: [], error: "pubmed-unreachable" };
  }
}

export async function fetchDrugLiterature(catalogueName: string): Promise<DrugLiterature> {
  const name = catalogueName.trim();
  if (!name || /["\r\n]/.test(name)) {
    return { label: null, articles: [], error: "bad-drug-name" };
  }
  try {
    const articles = await cached(`drug:${name}`, (signal) => articlesForQuery(drugTopicQuery(name), signal));
    return { label: name, articles, error: null };
  } catch {
    return { label: name, articles: [], error: "pubmed-unreachable" };
  }
}
