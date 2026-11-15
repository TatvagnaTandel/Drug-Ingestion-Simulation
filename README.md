# Drug-in-Body Simulator

An educational web simulator for oral pharmacokinetics, built to the PRD
(`docs/PRD.md`) and TRD (`docs/TRD.md`).

## Run locally

Use Node.js 24 to match the GitHub Pages build.

```bash
npm install
npm run dev:web
```

Open `http://localhost:3000/simulator` and select **Start journey** to play a
built-in study. **Custom setup** also includes a synthetic example that works
without credentials.
For catalogue search, sign-in and report saving, set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`apps/web/.env.local` and restart the web app. Use your project's publishable
key or legacy anon key. The root `.env.example` shows the variable names for
command-line checks. For email sign-in, allowlist your app's sign-in URL in
Supabase Authentication → URL Configuration. The static export returns to
`/dibmvp/signin/`, including the base path.

## Tree

```text
apps/web/          Next.js simulator and anatomy walkthrough
packages/engine/    PK engine: simulate, closedFormSingleDose, buildReport, lookupInteraction
  tests/            vitest suite + test fixtures (placeholder drug — not real data)
data/               drugs.json (null params until sourced), interactions.json (empty), sources.md
api/summary/        optional Vercel-style AI summary function (template fallback)
scripts/            lint-copy script
docs/               PRD.md, TRD.md
```

## Tests & checks

```bash
npm install
npm test              # all Vitest suites
npm run typecheck
npm run lint:copy     # copy lint (banned phrases)
```

## Rules encoded in code

- Drug parameters in `data/drugs.json` stay `null` with TODO notes until a
  cited value exists (PK-DB / official labels). Never invented.
- `lookupInteraction` misses return "Not in our small verified set" — never
  "no interaction", never implying safety. <!-- lint-copy: allow -->
- `buildReport` always carries the fixed disclaimer.
- The AI summary is optional; every reply is verified (numbers ⊆ input, no
  banned phrases) or replaced by a deterministic template.
