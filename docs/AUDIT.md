# Anatomy Theatre production audit

## Repository map before implementation

| Area | Existing path and responsibility |
| --- | --- |
| Stack | npm workspaces. Next.js 16 App Router, React 19 and strict TypeScript in apps/web. Three.js, Tailwind utilities and Theatre CSS, optional Supabase data client, Vitest, PDF.js and jsPDF. |
| Routing | Server route entries in apps/web/app. Landing at /, guided Simulator and Studies at /simulator and /simulator#studies, Lab at /simulator/organ-lab, How it works at /how-it-works, About at /about and Account at /signin. No app proxy or middleware file. next.config.ts has normal Next output with Cache Components and an existing optional static export at /dibmvp. No async request API is needed for the simulator routes. |
| State | Separate React client roots in components/simulator/simulator.tsx and components/organ-lab/simulator.tsx. Guided playback uses stage progress and playback.ts transforms, while Lab uses elapsed hours and selected section. Setup components hold local form state and dispatch parsed input to the simulation roots. |
| 3D | Route-specific body-figure.tsx files lazy-load scene.ts after mounting. anatomy/model.ts shares GLB loading and indexing, shaders.ts shares tissue shading, atlas-view.ts fits the camera and dose-journey.ts draws the guided route. The landing route uses a static hero image with CSS motion. |
| PK | packages/engine/simulate.ts and closedFormSingleDose.ts compute central exposure and gut/central amount/total elimination. curve.ts samples the chosen hour. organProfiles.ts computes illustrative organ responses. Drug parameter provenance is separate from those illustrative responses. |
| Results | Guided run-results.tsx draws central concentration and report actions. report-data.ts and report-pdf.ts build browser downloads with jsPDF. Lab has its own monitor and clearance comparison. There is no measured organ concentration for heart, lungs or brain or validated split between renal and hepatic clearance. |
| Data and auth | apps/web/lib/browser-data-client.ts builds the optional browser client. catalogue.ts queries approved data through packages/data-client. Built-in study inputs live in apps/web/lib/study-cases.ts; local catalogue source data is under data/. |
| Upload and citations | apps/web/lib/pdf-import.ts extracts browser-only PDF text from a local worker. Lab apply-pdf.ts maps explicitly reviewed values into setup. pubmed.ts and pubmed-client.ts construct and fetch literature lookups, and each simulator has a step-literature.tsx panel. |
| Access policies | supabase/migrations/0001_init.sql enables RLS for profiles and reports. Reports SELECT, INSERT, UPDATE and DELETE compare user_id with auth.uid(), with a WITH CHECK on insert/update. This is source evidence, not a claim about a deployed database. |
| Verification | Root typecheck, Vitest and lint:copy; npm run build:web and npm run start:web for production. apps/web/AGENTS.md requires the bundled Next docs. |

## Time model at baseline

The guided simulator uses a stage-progress coordinate for animation. Its mapping derives the first inter-dose peak from the engine samples and anchors early circulation to fractions of the rise, but multiple stages share time coordinates. The sidebar explicitly samples the prior stage while other values sample the current model time. A jump and a scrub therefore cannot be treated as equivalent operations yet. These are visual checkpoints for a central PK model, rather than measured organ arrival times.

## Time model after implementation

The guided simulator stores one elapsed time in hours. The stage selector sets that time to the checkpoint arrival. Between arrivals, the next camera view starts at the midpoint between checkpoints. Complete activates at the exact window end. The camera can hold its view for four seconds while the simulated clock continues. The prior stop is explicitly an earlier checkpoint, evaluated at its own labeled hour with the same engine function as the live readouts.

| Stage | Checkpoint hour |
| --- | --- |
| Swallow | First scheduled dose |
| Absorption | 10% of the rise interval |
| Portal circulation | 22% of the rise interval |
| Right heart | 38% of the rise interval |
| Lungs | 52% of the rise interval |
| Left heart | 68% of the rise interval |
| Brain | First sampled peak before the next dose |
| Liver clearance | 16% from that peak to the tail reference |
| Kidneys | 70% from that peak to the tail reference |
| Complete | End of the selected window |

The rise interval starts at gut entry (dose time plus lag) when it is before the peak, and at Swallow otherwise. The tail reference uses the first sustained crossing below 5% of the sampled peak after the final dose, if it occurs after the first sampled peak. Otherwise the reference is the window end. A missing or boundary-only peak uses the midpoint of the available window. A dose scheduled only at the window endpoint uses the window start for illustrative Swallow so the stages remain ordered. These are playback choices. The model estimates one central concentration and total elimination, and it does not measure organ arrival times or resolve separate renal and hepatic elimination.

At a requested time between stored samples the same solver evaluates the remainder of the interval from the preceding sample, accounting for any dose-entry events. Display times use up to four decimals and show an approximation sign when rounded. The plotted course uses sampled data with a marker at the current simulated hour. The Levetiracetam liver checkpoint is 8.992 h (7.238 mg/L); a scrub to 8.99 h reads 7.240 mg/L.

## Production evidence

| Check | Result |
| --- | --- |
| Root and app TypeScript | `npm run typecheck` and `npx tsc -p apps/web/tsconfig.json --noEmit --incremental false` exited 0. |
| Repository lint | `npm run lint:copy` returned `lint-copy: OK — no banned phrases found`. The repo has no general code lint script. |
| Vitest | `npm test`: 272 tests across 29 files passed. |
| Next.js production | Blank public Supabase configuration, `npm run build:web`, then `next start`. Next 16.4.5 compiled and prerendered 9/9 pages. Playwright found no Next dev portal. |
| Chromium | All 11 scenarios in `apps/web/e2e/production.spec.ts` passed on the same production build across an initial run, a resumed subset and a focused renderer rerun. Recorded checks cover both study runs, exact scrub, results, real exports, four viewport sizes, signed-out custom setup and reload, the Lab and PDF.js worker, unavailable/context-lost WebGL, navigation disposal, and literature retries/cache. |
| Stage views | Nine jumps plus Complete at 1440×900, 1920×1080, 1024×768 and 390×844. [Desktop screenshots](screens/1440x900/) and [mobile screenshots](screens/390x844/) contain all nine stage views. Current camera fitting also tests the actual GLB bounds, including both renal arteries. |
| WebGL lifecycle | Five Simulator visits each used 105 geometries, 0 textures, 5 programs at the same paused Swallow stage. Five Organ Lab visits each used 108, 0, 3. Every cleanup measured 0, 0, 0; the Simulator run and clock survived returning. Offscreen frame counter stayed fixed through ten browser frames. On a DPR 3 desktop viewport, the buffer ratio was 2. A stalled GLB fell back in 10.381 s and retry loaded it. These are renderer counters, not whole browser heap measurements. |
| Motion and accessibility | Production Landing animation ran → paused → ran; reduced-motion emulation removed the animation. Axe WCAG 2.0/2.1 A/AA and computed text checks found no issues in 11 tested route/state combinations, including guided setup/results and the Lab in both themes. Keyboard checks exercised the guided scrubber and Lab camera selector and empty tooltip. |
| Downloads | Real Levetiracetam PDF downloaded and all three pages were opened. It includes 10.272 mg/L Cmax, 3.60 h Tmax, 151.38 mg·h/L AUC, 7.38 h half-life, all ten checkpoint rows, the three shared series, sources and the model disclaimer. At 48 h the report shows 0.187 mg/L. Both study reports were checked for metrics, units, checkpoints and citations. CSV download contained 961 timed data rows. |

Lighthouse 13.6.0 measured the initial Landing and Simulator routes in production with the same presets. Scores are Performance / Accessibility / Best Practices. Timing is Largest Contentful Paint.

| Route | Preset | Before | After | LCP before → after |
| --- | --- | --- | --- | --- |
| Landing | Desktop | 100/100/100 | 100/100/100 | 0.6 s → 0.6 s |
| Landing | Mobile | 83/100/100 | 97/100/100 | 4.8 s → 2.6 s |
| Simulator | Desktop | 100/100/100 | 100/100/100 | 0.8 s → 0.8 s |
| Simulator | Mobile | 82/100/100 | 91/100/100 | 5.0 s → 3.5 s |

## Sources, configuration and limits

- The four built-in citation targets point to the [levetiracetam study](https://pubmed.ncbi.nlm.nih.gov/32208795/), [levetiracetam label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=08e1bfea-7f3f-42d9-823d-f75080e664ff), [linezolid study](https://pubmed.ncbi.nlm.nih.gov/19564361/), and [ZYVOX label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6e70e63b-bfd5-478d-a8ee-8ba22c9efabd). The Brain stop points to the [general blood–brain barrier paper](https://pubmed.ncbi.nlm.nih.gov/27020469/). The literature panel caches successful lookups for the tab and evicts errors so they can be retried.
- Git tracks .env.example and ignores apps/web/.env.local. The browser reads only the public Supabase URL and a publishable or legacy anon key. Build config rejects other public key formats and rejects a legacy JWT with a service role. Report ownership policies were verified in the migration and covered by the migration tests. Live account sign-in, profile/report saving and deployed RLS were outside the signed-out production build.
- PDF.js runs in a dedicated browser worker. It extracts local text, never submits or logs snippets, and applies fields only through the review table. The size limit is 10 MB, with further page and text limits. Scanned files need a text layer. The parser recognizes simple labeled text rows. A restored setup contains reviewed numeric values but excludes source text, file names and notes. Lab runs and drafts marked as PDF-derived cannot be saved to Supabase.
- The model has no sourced concentration threshold or independent renal and hepatic elimination rates. Results therefore report Cmax, Tmax, AUC and half-life, a shared central trace, gut amount and total elimination. Time above threshold and separate organ elimination curves would require additional sourced model inputs.
- A saved setup stores the latest valid configuration in this browser. A medicine available only from the live catalogue needs that catalogue to restore after refresh. Weight scales volume and clearance. Age and sex are profile metadata, with sex initially unspecified. The guided context is an anatomy label. Lab context also filters catalogue suggestions; explicit Lab organ profiles and clearance options control the illustrative scenarios.
- Playwright is the only added dependency for this production-readiness pass. It exercises the production UI and browser workers. Existing `any` uses in legacy Supabase adapters, scripts and test fixtures predate this pass. The strict typechecks passed and the new app code uses no `any` or TypeScript suppression. The earlier `docs/DESIGN.md:245` trailing blank line is outside this task's changes.
