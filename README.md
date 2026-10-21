[![Databricks](https://img.shields.io/badge/Databricks-App-FF3621?style=for-the-badge&logo=databricks)](https://databricks.com)
[![Unity Catalog](https://img.shields.io/badge/Unity_Catalog-Governed-00A1C9?style=for-the-badge)](https://docs.databricks.com/en/data-governance/unity-catalog/index.html)
[![Lakeflow](https://img.shields.io/badge/Lakeflow-Declarative_Pipelines-00C851?style=for-the-badge)](https://docs.databricks.com/en/dlt/index.html)

# Subsurface Command

A subsurface command center for an onshore North America well program, built as a Databricks App. One governed lakehouse holds the wells, their logs, the interpretation, the economics, and the drilling and equipment context. The app reads it, Genie answers questions over it, and a multi-agent supervisor reasons across it.

The decision it supports: **which zones in which wells are worth completing, and can we trust the rock properties behind that call when a well is missing a curve.** Geomechanics (pore pressure, wellbore stability, frac design) needs a sonic log. GREENRIVER-03 never ran one. The usual fix is Gardner's density transform. This build replaces it with a served model, measured against Gardner on wells it never saw.

## What is in it

| Layer | What | Where |
|---|---|---|
| Land | Well headers, formation tops, LAS-style log exports into a UC volume | `pipelines/generate_raw.py` |
| Pipeline | Lakeflow SDP: bronze (Auto Loader) to QC'd silver to gold petrophysics and net pay | `pipelines/subsurface_pipeline.py` |
| Model | Synthetic sonic: gradient-boosted trees on GR, RHOB, NPHI, RT, depth, formation | `ml/train_synthetic_sonic.py` |
| Serving | UC model `synthetic_sonic@champion` on endpoint `subsurface-synthetic-sonic`, behind AI Gateway | same |
| Governance | Persona table, basin row filter, masks on interpreted columns, declared on the tables | `governance/policies.sql` |
| Genie | Existing space extended with the gold tables, rules, and example SQL | `genie/update_space.py` |
| App | React + FastAPI: 3D voxel property model, spatial wells, logs, economics, equipment, governance, supervisor | `app.py`, `server/`, `frontend/` |
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

METRICS_TABLE

Read it this way: the published Gardner coefficients are biased for these rocks, and even a calibrated one-curve transform explains little of the sonic, because slowness here depends on porosity, shale, gas, and burial together. A multi-curve fit recovers most of it. The trees add a modest gain over the linear fit by capturing the non-linear velocity mixing. The residual floor is the sonic-only behaviour (cementation, pore pressure) that no other curve sees, which is also why the app shows the model next to Gardner and never as measured data.

## Governance

`governance/policies.sql` creates a persona mapping table and three functions. The pipeline declares a row filter and two column masks on `gold_zone_summary`; the training job applies the row filter to `gold_synthetic_sonic`.

- `access_personas(principal, persona, allowed_basin)`: who is a JV partner and which basins they are party to.
- `basin_filter(basin)`: JV partners only see rows for their basins.
- `mask_interpretation(v)`: JV partners see net pay but not the operator's interpreted saturation or hydrocarbon pore feet.

Because the rules live on the tables, they hold in the app, Genie, the SQL editor, and notebooks alike. GOVERNANCE_CHECK

## Decisions

- **Logs come from one rock model.** Every curve at a depth is derived from the same latent porosity, shale volume, and saturation, so density and neutron agree, GR tracks shale, the sonic slows with porosity and gas. Without that, a sonic model would be learning noise. The app's DuckDB seed and the lakehouse use the same generator and seeds, so both show the same logs.
- **Offset wells only for training.** Eight offset wells (`role = training_offset`) give the hold-out enough wells. They are in the lakehouse, never in the app.
- **QC in the pipeline, not the app.** Spikes are nulled and flagged, never smoothed over, and each expectation records how many samples it touched.
- **Gas-corrected porosity.** Density-neutron porosity keeps the Westwater gas zone from reading as either tight (neutron) or over-porous (density).
- **Policies on tables, not in the app.** The app's persona toggle demonstrates the same rules, but Unity Catalog enforces them.
- **Fallback is labelled.** If the endpoint is cold or unreachable, `/api/sonic/{well}` answers with Gardner and returns `source = "gardner"`. The UI says which one you are looking at.

## Known simplifications

- **Synthetic data.** Wells, logs, economics, and telemetry are synthetic. The coupled rock model makes the logs behave like logs; it is not a field dataset.
- **OSDU / ADME feeds are not live.** The OSDU reservoir, rock-and-fluid, and wellbore records come from a partner Azure ADME workspace that is currently unavailable. Panels that read them degrade gracefully and are labelled.
- **Same zone stack in every basin.** For the demo, every well uses one stratigraphic column. Real basins would each carry their own.
- **The voxel model is interpolated, not simulated.** It spreads well-log properties between wells inside each area of interest; it is a property model for visualisation and screening, not a reservoir simulation.

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

## Tech stack

FastAPI, DuckDB (in-process app state), React 18 with three.js and Recharts, Databricks SDK, Lakeflow Spark Declarative Pipelines, MLflow 3 with Unity Catalog models, Model Serving with AI Gateway, Genie, Unity Catalog row filters and column masks.

## License

See `LICENSE` and `NOTICE`.
