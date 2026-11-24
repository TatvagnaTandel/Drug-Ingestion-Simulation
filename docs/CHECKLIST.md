# Production readiness checklist

A checked item has verification evidence. An unchecked item records a remaining gap. See [the audit](AUDIT.md) for the evidence and its scope.

## Requirements

- [x] R1 — The scrubber, stages, camera, readouts and chart marker use the same simulated hour. Mapping documented in AUDIT.md and covered by playback.test.ts. Production t = 12 h displayed 5.496 mg/L against independent 5.496253 mg/L. Previous stops label their checkpoint times.
- [x] R2 — guided-study-pk.test.ts verifies the independent levetiracetam closed form, linezolid superposition, weight scaling, five medicines, window changes, zero and invalid inputs. The Results disclosure covers Cmax, Tmax, AUC and half-life. The supplied data contains no sourced threshold.
- [x] R3 — Production Lab starts paused at zero with a disabled transport and actionable tooltip. Both study starters were exercised. Light/dark theme control retained and contrast checked. The walkthrough follows native page scroll and has a keyboard camera selector.
- [x] R4 — setup-form.test.ts, setup-boundaries.test.ts and production signed-out setup cover blur validation, visible reason, numeric bounds and reload of a valid draft. Both forms disclose context and age/sex limits. Secondary Save profile and confirmation verified in source, with backend validation and success covered by the mock client.
- [x] R5 — Production Results and rendered PDFs show a shared central trace, gut amount and total elimination. No evidence supports splitting clearance. Browser downloaded PDF and a 961-row CSV. Inspected metrics, units, both study citations and educational disclaimer.
- [x] R6 — All nine stages at four viewport sizes, actual GLB bounds tests, fullscreen and resize, DPR 3 capped at 2, and posterior renal framing. Reduced motion and Pause animation checked. Ten route changes verified stable renderer counts and zero after every disposal.
- [x] R7 — `next build` and `next start` with no dev badge. App error boundary inspected in source. Unavailable/lost WebGL, stalled GLB deadline and successful retry exercised. Lighthouse all four route/preset combinations before/after. Axe and visible font size checks across 11 states.
- [x] R8 — Both study papers and labels, the organ process sources and numeric PMID destinations checked. Production PubMed outage/retry/cache scenario passed with controlled responses.

## Cross-cutting gates

- [x] Pre-implementation AUDIT.md and checklist written. Consulted installed App Router, Server/Client Components, error boundary and asset/font docs when touching Next.js APIs.
- [x] Root and web strict TypeScript checks. Playwright added for end-to-end checks. WebGL and PDF code loaded lazily in browser components. Disclaimer confirmed on screen and in PDF.
- [x] Signed-out production and offline catalogue exercised. catalogue.test.ts covers the eight-second live timeout and retry. Env key handling audited and owner-only report RLS verified in source SQL and migration tests.
- [ ] Optional signed-in verification remains partial. The production check intentionally ran without Supabase credentials, so a real save confirmation and deployed RLS were not exercised.
- [x] Production PDF.js worker observed with a synthetic PDF. Review table, source snippet and confirmation exercised. Parser fixtures cover scanned, password-protected, corrupt and oversized files. Raw PDF text stays in the browser and PDF-derived report writes are blocked.
- [x] Pure PK, stage mapping, units, validation, PDF and CSV checks plus form, scrubber and Results component checks without WebGL.
- [x] Typechecks, repository lint, 272 Vitest tests, production build and start. Command evidence in AUDIT.md. The repository lint checks copy.
- [x] Eleven production browser scenarios all passed on the same build across the initial run, a resumed subset and a focused renderer rerun.
- [x] Eighteen screenshots under docs/screens/1440x900/ and docs/screens/390x844/.
- [x] Adversarial review covered clock rounding, PDF pagination, accessibility names/contrast, access policy SQL and cached-canvas restoration. Fixed the discovered issues and documented remaining limits above and in AUDIT.md.

## Desktop UX refinement

The R1–R8 checks above record the earlier production pass. The current UX pass replaces that pass’s Lab theme and scroll-driven camera. The desktop captures are from `next build` and `next start` in signed-out mode. See the [audit and ranked review](UX_AUDIT.md) and [design system](DESIGN_SYSTEM.md).

| Requirement | Status and implementation | Before | After |
| --- | --- | --- | --- |
| U1 | Done. Shared glass body and tissue palette. Guided capsule crosses the lips and reaches the stomach before the modeled clock advances. | [Swallow](screens/ux/before/1440x900/stage-1.png) | [Capsule sequence](screens/ux/after/capsule/), [Lab](screens/ux/after/1440x900/lab-idle.png) |
| U2 | Done for desktop. Anatomy uses about 64.5% of the workspace. Readouts dock alongside it, supporting prose collapses during scrubbing, and the transport fits the 900 px desktop frame. The mobile sheet is outside this pass. | [Brain](screens/ux/before/1440x900/stage-7.png) | [Brain](screens/ux/after/1440x900/stage-7.png) |
| U3 | Done. Ordered stepper, hover labels for stage ticks, peak marker, one displayed clock and an expandable previous checkpoint. | [Liver](screens/ux/before/1440x900/stage-8.png) | [Liver](screens/ux/after/1440x900/stage-8.png) |
| U4 | Done. Larger central plot, curve readout, elapsed fill and marker, prominent Now and Overall values, and pressed state for organ inspection. | [Lungs](screens/ux/before/1440x900/stage-5.png) | [Lungs](screens/ux/after/1440x900/stage-5.png) |
| U5 | Done. Shared Medicines, Person, and Window and run panels. Removable chips, source-backed ranges, live summary, validation on interaction and peach Run action. | [Setup](screens/ux/before/1440x900/setup.png) | [Setup](screens/ux/after/1440x900/setup.png), [Catalogue selection](screens/ux/after/setup-catalogue.png) |
| U6 | Done. Separate Organ Lab for free exploration. View and model time are independent. One-click synthetic and published starters, with active organ monitors. | [Lab idle](screens/ux/before/1440x900/lab-idle.png) | [Lab idle](screens/ux/after/1440x900/lab-idle.png), [Lab active](screens/ux/after/1440x900/lab-active.png) |
| U7 | Done. Metric cards, central and secondary plots, shared-by labels, chevron disclosures, inputs/sources and PDF/CSV actions. | [Results](screens/ux/before/1440x900/results.png) | [Results](screens/ux/after/1440x900/results.png) |
| U8 | Done for reviewed states. Persistent footer collapse, nearby educational notes, primary Setup, shared type hierarchy and dark theme. | [About](screens/ux/before/1440x900/about.png) | [About](screens/ux/after/1440x900/about.png) |
| U9 | Done. Original hero with desktop crop, one primary CTA, study link, trust row and three steps. | [Landing](screens/ux/before/1920x1080/landing.png) | [Landing](screens/ux/after/1920x1080/landing.png) |
| U10 | Partial. Download and save status feedback, local error messages and loading states, keyboard-visible hints and delayed Lab tooltip. Existing local error messages stay next to the controls. | [Lab idle](screens/ux/before/1440x900/lab-idle.png) | [Lab idle](screens/ux/after/1440x900/lab-idle.png), [Swallow](screens/ux/after/1440x900/stage-1.png) |
| U11 | Partial. Keyboard controls, stage announcements, focus and reduced motion. Axe found zero WCAG A/AA violations in ten checked desktop states. Mobile-specific refinement and a continuous sweep of 360–1920 px were excluded. | [Kidneys](screens/ux/before/1440x900/stage-9.png) | [Kidneys](screens/ux/after/1440x900/stage-9.png) |

The desktop UX build, root typecheck, copy lint, and 273 Vitest tests passed. All 11 Playwright scenarios passed on `next start`, including the actual PDF and CSV downloads, local PDF review, lost WebGL recovery and ten route transitions. Renderer counts stayed at 106 geometries / 0 textures / 7 programs on Guided and 108 / 0 / 3 on Lab before disposal, and returned to 0 / 0 / 0 each time. The final CSS correction rebuilt successfully. A targeted check at 1440×900 and 1920×1080 confirmed the hero crop, legend, persistent footer setting, stage shortcut and announcement, visible timeline, chart cursor, and independent Lab camera on that build.

The lab PDF worker and catalogue fallback were exercised signed out. Git tracks the example env file only, and the build rejects a configured key unless it is public. The migration defines owner-only read, insert, update and delete policies for saved reports. Live sign-in, saving and deployed RLS were outside the signed-out check.
