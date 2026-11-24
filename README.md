# Manava · Anatomy Theatre

A 3D simulator for learning how an oral dose moves through the body and how its concentration changes over time.

**[Live demo](https://anatomy-theatre.gladbeam1.chatgpt.site)** · [Quick start](#quick-start) · [Screenshots](docs/screens/current) · [Technical docs](docs/TRD.md)

![Languages used: TypeScript, Python, CSS, PL/pgSQL, JavaScript, and Shell](docs/languages.svg)

<img src="apps/web/public/images/manava-rotation.webp" alt="Looping anatomy preview showing the digestive tract" width="240">

## What you can do

- **Follow a dose.** Play a guided Levetiracetam or Linezolid study, jump between organ stops, and scrub the timeline.
- **Explore Organ Lab.** Inspect organs and compare how illustrative changes in clearance affect the concentration curve.
- **Read and export results.** Review concentration curves and peak metrics, then export a PDF report or CSV time series.

## Quick start

Use Node.js 24 and npm.

```sh
git clone https://github.com/TatvagnaTandel/Drug-Ingestion-Simulation.git
cd Drug-Ingestion-Simulation
npm ci
npm run dev:web
```

Open [localhost:3000](http://localhost:3000). The built-in studies run without an account or API keys.

## About the model

Manava uses a one-compartment oral pharmacokinetic model with first-order absorption and elimination. The anatomy shows the route of a dose, and the charts show model estimates. Organ Lab scenarios are illustrative. For educational use only.

[Validation references](data/validation.json) · [Organ profile sources](data/organ-profiles) · [Optional Supabase setup](supabase/README.md) · [BodyParts3D credits and licences](assets/anatomy/README.md#licence)
