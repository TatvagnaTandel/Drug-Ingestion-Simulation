# Heart Organ Dataset (Synthetic Reference Profiles)

## What this is

Six heart "archetypes" — a healthy baseline plus five common cardiac
conditions — with the physiological numbers your Blender model and
simulation code need to render and animate a heart under different
conditions. Files:

- `heart_profiles.json` — the full dataset, machine-readable, with field
  definitions and the basis for each profile.
- `heart_profiles.csv` — the same six profiles as a flat table, for quick
  loading into pandas or a spreadsheet.

## Important: this is synthetic, not patient data

There is no real patient dataset involved here, and there shouldn't be —
using real people's medical histories would raise the privacy issues
already flagged in the project brief (consent, anonymization, DPDP Act /
HIPAA / GDPR). These six profiles are built instead from the public
**NYHA (New York Heart Association) functional classification**, which
grades heart failure symptoms from class I (no limitation) through class
IV (symptoms at rest), plus standard cardiac reference ranges for a
healthy adult.

Numbers inside each profile beyond the class-defining symptom thresholds
(for example, exact ejection fraction or QT interval) are illustrative
midpoints for that severity level, not values pulled from a specific
study. Before using this beyond a hackathon demo, run it through a review
step like the one already built for the drug PK table: one source URL and
one quoted sentence per number you want to rely on.

## How Anatomy Theatre uses these profiles

Anatomy Theatre uses each profile’s resting heart rate, QT interval, ejection
fraction and cardiac output as starting values. The sensitivity fields shape
illustrative traces driven by concentration relative to the run’s peak.

The traces are fictional teaching outputs. Use them to compare model
behavior under different assumptions.

## Field reference

See the `field_notes` object inside `heart_profiles.json` for a
definition of every column. The short version:

| Field | Meaning |
|---|---|
| `nyha_class` | I (no symptoms) through IV (symptoms at rest), or none |
| `lvef_pct` | Left ventricular ejection fraction; normal is roughly 55-70%, HFrEF is under 40% |
| `cardiac_output_l_min` | Blood pumped per minute; falls as the heart weakens |
| `baseline_qt_interval_ms` | Baseline QT interval; a longer baseline leaves less safety margin before a QT-prolonging drug becomes dangerous |
| `contractility_multiplier` | Simulation scaling factor for pumping strength, 1.0 = healthy baseline |
| `conduction_sensitivity_multiplier` | Simulation scaling factor for arrhythmia risk from a drug, 1.0 = healthy baseline |
| `cardiotoxic_sensitivity_multiplier` | Simulation scaling factor for drug-caused heart damage, 1.0 = healthy baseline |

## Suggested next step for your team

Add a `source_url` and `source_quote` column to a working copy of this CSV
and start replacing illustrative values with cited ones, one profile at a
time, starting with the ones you'll actually demo.
