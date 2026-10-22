[![Databricks](https://img.shields.io/badge/Databricks-App-FF3621?style=for-the-badge&logo=databricks)](https://databricks.com)
[![Unity Catalog](https://img.shields.io/badge/Unity_Catalog-Governed-00A1C9?style=for-the-badge)](https://docs.databricks.com/en/data-governance/unity-catalog/index.html)
[![Lakeflow](https://img.shields.io/badge/Lakeflow-Declarative_Pipelines-00C851?style=for-the-badge)](https://docs.databricks.com/en/dlt/index.html)

# Subsurface Intelligence

*Built for Landman Oil, an illustrative upstream operator whose scale comes from a public major's 2025 strategy disclosures.*

*From raw well logs to a located, priced, governed drilling decision, on one Databricks platform, in one sitting.* (Deployed as the `subsurface-command` Databricks App.)

## The business challenge

In a producing field the data needed to place the next well already exists: well logs, formation tops, well headers, OSDU records, economics. It sits in separate tools owned by separate teams, so every next-well proposal is a chain of exports and hand-offs that takes weeks, and delay costs value. Gaps stall it further: a well drilled without a sonic log blocks geomechanics and seismic ties until someone patches it by hand with Gardner's density transform. And AI assistants either cannot see the governed data or see too much, exposing interpretation to joint-venture partners.

## What it does

One decision, six steps, in one Databricks App, every number traceable to a governed table:

1. **Locate the wells.** Fleet map on Databricks Spatial SQL (ST_ConvexHull, ST_Distance, H3): basin footprints, well spacing, and each field's proposed step-out.
2. **Read the logs.** Raw curves, QC flags, corrected curves, petrophysics, from the Lakeflow pipeline below.
3. **Fill the missing sonic.** GREENRIVER-03 never ran a sonic log. A served model predicts it, measured against Gardner on wells it never saw: **3.0 vs 10.7 us/ft, 3.6x lower error**.
4. **Model the subsurface.** A 49,152-cell voxel geomodel built from the logs in about a second: structure honouring every formation top, Vcl, porosity and Sw kriged between wells per stratigraphic sub-layer, a saturation-height function above the free-water level, and an uncertainty attribute. It ranks a step-out **2,616 ft** from SANJUAN-01 with **253 ft** of hydrocarbon pore thickness, 15% above the control wells.
5. **Value the well.** The step-out is priced by the certified UC functions `calculate_npv10` and `calculate_break_even`: **$103M NPV10 unrisked, $40M risked** (34% IRR, 2-year payback, $53 break-even) on $58M capex at $79 WTI.
6. **Decide and govern.** A multi-agent Subsurface Supervisor (planning, model choice, cost and guardrails through AI Gateway) and Genie answer over the same governed tables. A UC row filter and column masks limit a JV partner to their basin, live in the app's Governance tab.

## Business outcomes (demo data)

| Lever | Outcome |
|---|---|
| Value per decision | A step-out worth $103M NPV10 unrisked, $40M risked, found and priced from data the team already has |
| Speed to decision | Logs to a priced proposal in one sitting; each 6 months of delay costs about $1.9M of the risked value ($4.8M unrisked) at 10% |
| No blocked decisions | Missing sonic filled in seconds with 3.6x lower error than calibrated Gardner on 13 held-out wells |
| Safe to share | JV partner sees 30 of 84 zone rows, interpretation masked, in the app, Genie and SQL |
| Cost stays visible | Scale-to-zero endpoint metered by AI Gateway, serverless pipeline, per-run AI cost on the Supervisor |

## What is in it

| Layer | What | Where |
|---|---|---|
| Land | Well headers, formation tops, LAS-style log exports into a UC volume | `pipelines/generate_raw.py` |
| Pipeline | Lakeflow SDP: bronze (Auto Loader) to QC'd silver to gold petrophysics and net pay | `pipelines/subsurface_pipeline.py` |
| Model | Synthetic sonic from GR, RHOB, NPHI, RT, depth, formation: linear and gradient-boosted candidates, champion by held-out MAE | `ml/train_synthetic_sonic.py` |
| Serving | UC model `synthetic_sonic@champion` on endpoint `subsurface-synthetic-sonic`, behind AI Gateway | same |
| Governance | Persona table, basin row filter, masks on interpreted columns, declared on the tables | `governance/policies.sql` |
| Genie | Existing space extended with the gold tables, rules, and example SQL | `genie/update_space.py` |
| Geomodel | Voxel property model, step-out ranking, and step-out pricing via the certified UC NPV function | `server/voxels.py`, `server/stepout_value.py` |
| App | React + FastAPI: voxel model (three.js), spatial wells, logs, sonic, economics, equipment, live UC policy panel, supervisor | `app.py`, `server/`, `frontend/` |
| Orchestration | Bundle job `subsurface-command-build`: land, policies, pipeline, train/serve/score | `databricks.yml` |

## Architecture

```
 well master, tops, LAS exports
          |
          v
 UC volume  /Volumes/oil_pump_monitor_catalog/subsurface_command/raw
          |  Auto Loader
          v
 bronze_logs, bronze_well_header, bronze_formation_tops      (streaming tables, file lineage)
          |  despike vs +-5 sample moving average, gap and range flags, formation tagging
          v
 silver_logs, silver_wells                                    (expectations record every rule)
          |  Vcl (linear GR), density-neutron porosity, Archie Sw, pay cut-offs
          v
 gold_petrophysics, gold_zone_summary (row filter + masks), gold_sonic_features
          |
          +--> ml/train_synthetic_sonic.py --> UC model synthetic_sonic@champion
          |                                     --> endpoint subsurface-synthetic-sonic (AI Gateway)
          |                                     --> gold_synthetic_sonic, gold_sonic_model_metrics
          v
 Databricks App (OBO + service principal) , Genie space , Supervisor agents
```

## The model, and how it is judged

**Task.** Predict compressional slowness (DT, us/ft) from the curves every well has: gamma ray, bulk density, neutron porosity, log10 deep resistivity, depth, and formation.

**Evaluation.** Leave-one-well-out. Neighbouring samples in a well share the same rock, so a random row split would leak and flatter every method. Each well is predicted by methods fit only on the other wells. All methods are scored on the same held-out samples.

**The bar.** What a petrophysicist does today without a model: Gardner's transform, both with the published coefficients and refit on the training wells (the fair comparison), plus Faust's resistivity transform and a linear fit on the same inputs as the model.

| Method (held-out wells) | MAE us/ft | RMSE us/ft | R2 | Bias us/ft |
|---|---|---|---|---|
| Gardner (published coefficients) | 17.23 | 22.25 | -1.542 | +10.93 |
| Gardner (refit on training wells) | 10.68 | 12.34 | 0.219 | -0.92 |
| Faust (refit on training wells) | 6.64 | 8.66 | 0.615 | -0.54 |
| Gradient-boosted trees, all curves | 3.05 | 3.81 | 0.925 | -0.01 |
| Linear, all curves **(champion)** | 3.00 | 3.76 | 0.927 | -0.01 |

13 wells, 31,189 QC-passed samples, leave-one-well-out. Champion: `synthetic_sonic` v2 on `subsurface-synthetic-sonic`.

Read it this way: the published Gardner coefficients over-predict slowness by about 11 us/ft on average for these rocks (worst in the low-density gas sand), and even a calibrated one-curve transform explains about a fifth of the sonic, because slowness here depends on porosity, shale, gas, and burial together. Using every curve cuts the error by about 3.5x against the fair bar (MAE 3.0 vs 10.7 us/ft).

**Champion choice.** Gradient-boosted trees and the linear fit tie (3.05 vs 3.00 us/ft). Both sit at the noise floor set by sonic-only behaviour (cementation, pore pressure, tool noise) that no other curve sees, so no method can do better on these logs. The rule in the training job is lowest held-out MAE, and within 2% the simpler model wins. The linear model is the champion: cheaper to serve, readable coefficient by coefficient, and more predictable outside the training rocks. The trees stay in the evaluation so the comparison is re-run every build. The app shows the synthetic curve next to Gardner and never as measured data.

## Governance

`governance/policies.sql` creates a persona mapping table and three functions. The pipeline declares a row filter and two column masks on `gold_zone_summary`; the training job applies the row filter to `gold_synthetic_sonic`.

- `access_personas(principal, persona, allowed_basin)`: who is a JV partner and which basins they are party to.
- `basin_filter(basin)`: JV partners only see rows for their basins.
- `mask_interpretation(v)`: JV partners see net pay but not the operator's interpreted saturation or hydrocarbon pore feet.

Because the rules live on the tables, they hold in the app, Genie, the SQL editor, and notebooks alike. Verified on the FEVM workspace: the operator view of `gold_zone_summary` returns 84 rows across 4 basins; the same query as a JV partner mapped to San Juan returns 30 rows, San Juan only, with `avg_pay_sw` and `hc_pore_ft` NULL and net pay visible. `gold_synthetic_sonic` filters the same way.

## Decisions

- **Logs come from one rock model.** Every curve at a depth is derived from the same latent porosity, shale volume, and saturation, so density and neutron agree, GR tracks shale, the sonic slows with porosity and gas. Without that, a sonic model would be learning noise. The app's DuckDB seed and the lakehouse use the same generator and seeds, so both show the same logs.
- **Offset wells only for training.** Eight offset wells (`role = training_offset`) give the hold-out enough wells. They are in the lakehouse, never in the app.
- **QC in the pipeline, not the app.** Spikes are nulled and flagged, never smoothed over, and each expectation records how many samples it touched.
- **Gas-corrected porosity.** Density-neutron porosity keeps the Westwater gas zone from reading as either tight (neutron) or over-porous (density).
- **Policies on tables, not in the app.** The Governance tab runs the same query as the app service principal and as the signed-in user (OBO), and its JV-partner toggle only writes the persona mapping; Unity Catalog does the enforcing.
- **Uncertainty is shown, not hidden.** The voxel model exposes the kriging standard deviation as an attribute, and the step-out ranking is haircut by it.
- **One definition of NPV.** `server/dcf.py` prices every well, the step-out and the offset through the certified UC functions `calculate_npv10` and `calculate_break_even` in one warehouse statement, and the same values are written to the UC `well_economics` table Genie reads. IRR and payback come from the same cash flows. The original underwriting NPV is kept as its own column for plan-vs-actual.
- **Price by type-curve scaling, not in-place volumes.** The synthetic Westwater is about 1,200 ft thick, so barrels from pore thickness and area would be unrealistic. The nearest offset's type curve is scaled by the ratio of hydrocarbon pore thickness (1.06x, 0.70x risked) and both wells are priced from scratch by the same certified function, so the comparison is like for like.
- **Every screen tags Live vs Illustrative.** Numbers computed from the governed data are tagged Live; modelled assumptions are tagged Illustrative.
- **Fallback is labelled.** If the endpoint is cold or unreachable, `/api/sonic/{well}` answers with Gardner and returns `source = "gardner"`. The UI says which one you are looking at.

## Known simplifications

- **Synthetic data.** Wells, logs, economics, and telemetry are synthetic. The coupled rock model makes the logs behave like logs; it is not a field dataset.
- **OSDU / ADME feeds are not live.** The OSDU reservoir, rock-and-fluid, and wellbore records come from a partner Azure ADME workspace that is currently unavailable. Panels that read them degrade gracefully and are labelled.
- **Same zone stack in every basin.** For the demo, every well uses one stratigraphic column. Real basins would each carry their own.
- **The voxel model is interpolated, not simulated.** It spreads well-log properties between wells inside each area of interest; it is a property model for visualisation and screening, not a reservoir simulation.
- **The structural framework is modelled.** Dip, closure and the normal fault are a modelled framework honoured at the well tops; a real horizon model would plug in.
- **Step-out economics borrow the offset's well design.** Same capex, opex and decline as the offset; productivity scales with hydrocarbon pore thickness.
- **WTI may be synthetic.** The app tries the FRED Marketplace share, then the public FRED CSV, then a synthetic series when it has no egress; every WTI label says which one it is using.

## Run it

```bash
# data + ML layer (FEVM target)
databricks bundle deploy -t fevm
databricks bundle run build -t fevm

# Genie space
python genie/update_space.py --profile fe-vm-oil-pump-monitor

# local sanity check of the sonic problem (numpy only)
python ml/local_check.py
```

The app deploys from a clean `_deploy/` copy with `databricks apps deploy` (see `DEPLOY.md`). Env vars it reads: `ADME_CATALOG`, `ADME_SCHEMA`, `DATABRICKS_WAREHOUSE_ID`, `GENIE_SPACE_ID`, `SONIC_ENDPOINT`.

## Execution evidence

Everything above ran. [`docs/evidence/EVIDENCE.md`](docs/evidence/EVIDENCE.md) summarises output captured from the live FEVM workspace, with the raw API responses beside it: the bundle job run and its task attempts, the Lakeflow pipeline update with row counts and data-quality expectations, the MLflow training run and its logged metrics, a live call to the served model with inference-table logging, a Genie conversation with its SQL and answers, the Unity Catalog policy before and after mapping a JV partner, live app API responses, the test suite, and an executed workspace notebook (`notebooks/evidence_run.py`). Re-capture with `python scripts/collect_evidence.py --profile <profile>`.

## How it was built

Built with an AI coding agent (Claude Code with Databricks' Isaac tooling) as a pair engineer: the work was planned as parallel tracks (a background agent built the pipeline, model training and UC policies while the main session rebuilt the UI, the voxel geomodel and the spatial map), and every claim was verified against the deployed app and workspace: API calls on each route, queries run as different identities to prove the policies, and browser screenshots of every screen. Live checks caught real bugs before the demo (well coordinates in UC disagreeing with the app, a serving call silently falling back to the baseline, an inverted depth axis, and randomized seeding that changed the geomodel's numbers on every restart). The evaluation design, baselines, champion choice, pricing method and provenance labels were human decisions.

## Tech stack

FastAPI, DuckDB (in-process app state), NumPy (geomodel), React 18 with three.js and Recharts, react-simple-maps, Databricks SDK, Lakeflow Spark Declarative Pipelines, MLflow 3 with Unity Catalog models, Model Serving with AI Gateway, Genie, Unity Catalog row filters and column masks.

## License

See `LICENSE` and `NOTICE`.

## Presenting it

- `docs/Subsurface-Intelligence-Deck.pdf`: 6 slides framing the live demo (title, the decision, business value, how it is built, the ask, what is real vs illustrative); numbers read from `ml/metrics.json` and the live step-out JSON (`python docs/deck/build_deck.py`).
- `docs/TALK-TRACK.md` and `docs/Subsurface-Intelligence-Talk-Track.pdf`: the FE Bar roleplay script with pre-flight checks, the click path, objection handling and the ask (`python docs/deck/build_talk_track.py`).
- `screenshots/`: hero captures of the live app used by the deck.
