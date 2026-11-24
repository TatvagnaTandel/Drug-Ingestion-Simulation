"use client";

import TheatreNav from "@/components/theatre-nav";

export default function TheatreError({ retry }: { retry: () => void }) {
  return (
    <div className="theatre">
      <TheatreNav />
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl">This page could not load</h1>
        <p className="mt-3 text-sm text-ink-2">Try loading the page again.</p>
        <button type="button" onClick={retry} className="theatre-button theatre-primary mt-6">Try again</button>
      </main>
    </div>
  );
}
