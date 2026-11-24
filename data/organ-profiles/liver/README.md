# Liver Organ Dataset (Synthetic Reference Profiles)

## What this is

Six liver "archetypes" — a healthy baseline plus five common disease and
injury states — with the physiological numbers your Blender model and
simulation code need to render and animate a liver under different
conditions. Files:

- `liver_profiles.json` — the full dataset, machine-readable, with field
  definitions and the basis for each profile.
- `liver_profiles.csv` — the same six profiles as a flat table, for quick
  loading into pandas or a spreadsheet.

## Important: this is synthetic, not patient data

There is no real patient dataset involved here, and there shouldn't be —
using real people's medical histories would raise the privacy issues
already flagged in the project brief (consent, anonymization, DPDP Act /
HIPAA / GDPR). These six profiles are built instead from the public
**Child-Pugh cirrhosis staging system**, which classifies cirrhosis
severity as class A (mild, 5-6 points), B (moderate, 7-9 points) or C
(severe, 10-15 points) from bilirubin, albumin, INR, ascites and
encephalopathy, plus standard liver-function reference ranges for a
healthy adult and for acute injury.

Numbers inside each profile beyond the class-defining score ranges (for
example, exact ALT or CYP450 activity) are illustrative midpoints for that
severity level, not values pulled from a specific study. Before using this
beyond a hackathon demo, run it through a review step like the one already
built for the drug PK table: one source URL and one quoted sentence per
number you want to rely on.

## How Anatomy Theatre uses these profiles

Anatomy Theatre gives the hepatic and renal clearance factors equal weight
in the solver. The ALT, AST and CYP450 fields shape illustrative traces
driven by elimination rate relative to the run’s peak.

The traces are fictional teaching outputs. Use them to compare model
behavior under different assumptions.

## Field reference

See the `field_notes` object inside `liver_profiles.json` for a
definition of every column. The short version:

| Field | Meaning |
|---|---|
| `child_pugh_class` | A (mild), B (moderate), C (severe) cirrhosis, or none |
| `alt_u_l` / `ast_u_l` | Liver-cell-injury markers; note these can look LOWER in Child-Pugh C than B because so little liver tissue remains to release them |
| `total_bilirubin_mg_dl` / `albumin_g_dl` / `inr` | The three lab values Child-Pugh scoring is partly built from |
| `cyp450_activity_multiplier` | Simulation scaling factor for drug metabolism speed, 1.0 = healthy baseline |
| `first_pass_bioavailability_multiplier` | Simulation scaling factor for how much more oral drug reaches the blood due to portal shunting |
| `clearance_scaling_factor` | Simulation scaling factor for hepatic drug clearance, 1.0 = healthy baseline |
| `hepatotoxic_sensitivity_multiplier` | Simulation scaling factor for drug-caused liver damage, 1.0 = healthy baseline |

## Suggested next step for your team

Add a `source_url` and `source_quote` column to a working copy of this CSV
and start replacing illustrative values with cited ones, one profile at a
time, starting with the ones you'll actually demo.
