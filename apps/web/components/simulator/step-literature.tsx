"use client";

import { useEffect, useRef, useState } from "react";
import { articleMetaLine, articleUrl, type LiteratureArticle, type LiteratureTopic } from "@/lib/pubmed";
import { fetchDrugLiterature, fetchTopicLiterature } from "@/lib/pubmed-client";

type StepLiteratureProps = {
  topic: LiteratureTopic;
  drugs?: Array<{ id: string; name: string }>;
};

export default function StepLiterature({ topic, drugs }: StepLiteratureProps) {
  const asideRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisible(true);
    });
    observer.observe(aside);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <aside
      ref={asideRef}
      className="mt-5 max-w-[46ch] rounded-lg border border-line bg-surface/50 px-3 py-2.5"
      aria-label="Published research about this process"
    >
      <p className="font-mono text-xs uppercase tracking-wider text-ink-3">From the literature · PubMed</p>
      {visible ? (
        <>
          <LiteratureSection key={topic} topic={topic} />
          {drugs?.slice(0, 3).map(({ id, name }) => (
            <div key={id} className="mt-2 border-t border-line/60 pt-1.5">
              <p className="font-mono text-xs uppercase tracking-wider text-ink-3">{name}</p>
              <LiteratureSection key={name} medicine={name} />
            </div>
          ))}
        </>
      ) : null}
      <p className="mt-1.5 text-xs leading-4 text-ink-3">
        Published research about this process — context, not the model&rsquo;s output and not advice.
      </p>
    </aside>
  );
}

type Lookup =
  | { state: "loading" | "unavailable" | "invalid" }
  | { state: "ready"; articles: LiteratureArticle[] };

function LiteratureSection({ topic, medicine }: { topic?: LiteratureTopic; medicine?: string }) {
  const [result, setResult] = useState<Lookup>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const request = medicine ? fetchDrugLiterature(medicine) : fetchTopicLiterature(topic ?? "whole-body");
    void request.then(({ articles, error }) => {
      if (!cancelled) {
        setResult(error === "bad-drug-name" ? { state: "invalid" } :
          error ? { state: "unavailable" } : { state: "ready", articles });
      }
    });
    return () => { cancelled = true; };
  }, [topic, medicine, attempt]);

  if (result.state === "unavailable") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
        <p role="status">PubMed is unavailable right now.</p>
        <button type="button" className="text-brand-text underline underline-offset-2" onClick={() => {
          setResult({ state: "loading" });
          setAttempt((count) => count + 1);
        }}>Retry lookup</button>
      </div>
    );
  }
  if (result.state === "invalid") {
    return <p className="mt-1 text-xs text-ink-3">No literature query is available for this medicine.</p>;
  }
  if (result.state !== "ready") {
    return <p className="mt-1 text-xs text-ink-3" role="status">Looking up published papers…</p>;
  }
  if (result.articles.length === 0) {
    return <p className="mt-1 text-xs text-ink-3">No matching papers were found.</p>;
  }
  return (
    <ul className="mt-1 space-y-1">
      {result.articles.map((article) => (
        <li key={article.pmid} className="text-xs leading-5">
          <a
            href={articleUrl(article.pmid)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-brand-text"
          >
            {article.title}
          </a>
          <span className="ml-1.5 font-mono text-xs text-ink-3">{articleMetaLine(article)}</span>
        </li>
      ))}
    </ul>
  );
}
