# Anatomy Theatre UX audit

Baseline captured on the signed-out production build. [1440×900](screens/ux/before/1440x900/) · [1920×1080](screens/ux/before/1920x1080/) · [820×1180](screens/ux/before/820x1180/) · [390×844](screens/ux/before/390x844/). Desktop is the design target. The user excluded mobile-specific optimization.

| Area | Baseline problem |
| --- | --- |
| Landing | Strong headline and art establish the editorial style. The evidence and three steps sit below the first fold and duplicate parts of the intro. |
| Guided idle and studies | Journey rail looks actionable before a run. Setup and study choices compete with the first-run action. |
| Guided active, stages 1–9 | Swallow parks the capsule at the end of its path at 0 h. The stage card narrows the frame and previous-stop information competes with live readouts. Time appears in several places. Stage markers are separate from the scrubber. The small chart has little room for axis labels or interaction. |
| Custom setup | Long stacked form, repeated catalogue controls across views, and no clear separation between medicine, person and run settings. |
| Results | Figures, legend, reports, source disclosures and secondary plots have similar prominence. Export contents are unclear before download. |
| Organ Lab | Same journey metaphor as Simulator. HUD decoration and cyan surfaces feel separate from the landing. The dark synthetic starter has low contrast and sits below advanced setup. |
| How it works and About | Both use narrow bordered reading cards with a late onward action. |
| Account | Oversized disabled form in offline mode provides no clear next action except global navigation. |
| Shared chrome | Fixed footer takes space from the anatomy. Some labels compete through variation in case and tracking. Only Lab has a light theme. |

## Adversarial desktop review

Reviewed the candidate at 1440×900 and 1920×1080 as a first-time visitor and a repeat user. The [candidate captures](screens/ux/review/) show the intermediate state before the fixes below.

| Rank | Finding | Resolution |
| --- | --- | --- |
| 1 | Guided playback fell below the 900 px fold. | Sized the desktop workspace to the viewport and gave longer readouts their own scrolling area. |
| 2 | Lab described scroll-driven camera movement after the interaction changed. | Replaced the stale visible and accessible instructions with the explicit Anatomy view selector. |
| 3 | The Lab serif token resolved to no value. The title looked like body copy. | Used the shared display font directly for the Lab heading. |
| 4 | The first Lab warning was below the main content. | Put the educational limitation beside the first-use actions. |
| 5 | Published Lab starters were below advanced inputs. | Grouped them with the synthetic starter in the header. |
| 6 | Lengthy previous-stop copy pushed live model values down. | Made previous values and supporting prose opt-in disclosures. |
| 7 | Results emitted an SVG title hydration warning. A peak label could repeat “at”. | Created a single text node per SVG title and reused the time phrase consistently. |
| 8 | The numbered reading steps were hard to scan. | Separated the markers from headings and split the first explanation. |
| 9 | Long custom inputs can still extend below the fold. | Shared section headers and a live summary establish order. The full form remains on one page, with no step gating. |
| 10 | Closely timed early checkpoints cluster on a linear 48-hour ruler. | Kept their actual spacing and provided a separate stage stepper and keyboard jumps. Stacked tick labels remain a possible follow-up. |
