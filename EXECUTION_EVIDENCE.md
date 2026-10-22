# Execution evidence

**This file is captured output, not code.** Every block below is copied verbatim from the live FEVM workspace: job task logs, pipeline event logs, MLflow metrics, a served-model request and response, AI Gateway inference-table rows, Genie conversations with their SQL and rows, Unity Catalog policy checks, the audit log, eval runs, and the test suite. The raw captures are plain text and JSON in [`docs/evidence/`](docs/evidence/) and [`docs/evidence/logs/`](docs/evidence/logs/).

| # | What ran | Result |
|---|---|---|
| 1 | Bundle job `subsurface-command-build`, run 739091380836337 | SUCCESS, 2026-10-21 17:04:05 UTC |
| 2 | Lakeflow pipeline `subsurface-command-pipeline` | COMPLETED, 35,014 bronze rows |
| 3 | MLflow training run `9d1636cb86c147d28909b8cd5576883d`, model v4 @champion | linear MAE 3.00 vs calibrated Gardner 10.68 us/ft |
| 4 | Served model `subsurface-synthetic-sonic` | READY, 8 predictions in 0.147 s warm (scale-to-zero cold starts take up to ~100 s) |
| 5 | Genie: 8 H2S and glossary questions | 8 of 8 COMPLETED |
| 6 | Unity Catalog row filter and masks as a JV partner | 84 rows to 30, interpretation masked |
| 7 | Drift checks and automatic retrains | 3 checks; drift on simulated wells triggered retrains; champion now v4 |
| 8 | Decision-brief eval set (5 fields) | 3/5, then 4/5, then 5/5 passing after two fixes |
| 9 | Engineer briefing on the H2S well | 8 open items on EASTTEXAS-05; glossary threshold change verified |
| 10 | Ontology (glossary on columns, PK/FK graph) | read back from information_schema |
| 11 | Audit trail | system.access.audit rows |
| 12 | Tests | 31 passed in 0.45s |

## 1. Bundle job run: task status and printed output

Job `subsurface-command-build` (532814868767936), run 739091380836337, **SUCCESS**, 2026-10-21 17:04:05 UTC to 2026-10-21 17:32:31 UTC.

| Task (run order) | Attempt | Result | Duration |
|---|---|---|---|
| land_raw | 0 | SUCCESS | 35.3 s |
| policies | 0 | SUCCESS | 39.6 s |
| medallion | 0 | SUCCESS | 82.9 s |
| train_serve_score | 0 | FAILED | 22.9 s |
| train_serve_score | 1 | FAILED | 25.2 s |
| train_serve_score | 2 | SUCCESS | 714.1 s |
| train_serve_score | 3 | SUCCESS | 692.7 s |

The two failed training attempts were a missing numpy/scipy in the serverless environment; the run was repaired in place.

`land_raw` printed:
```text
wells: 14  log samples: 35014  -> /Volumes/oil_pump_monitor_catalog/subsurface_command/raw
```

`policies` printed:
```text
ok: CREATE TABLE IF NOT EXISTS oil_pump_monitor_catalog.subsurface_command.access_personas (
ok: CREATE OR REPLACE FUNCTION oil_pump_monitor_catalog.subsurface_command.is_jv_partner()
ok: CREATE OR REPLACE FUNCTION oil_pump_monitor_catalog.subsurface_command.basin_filter(basin 
ok: CREATE OR REPLACE FUNCTION oil_pump_monitor_catalog.subsurface_command.mask_interpretation
```

`train_serve_score` printed (leave-one-well-out evaluation, champion choice, registration and serving):
```text
31189 labelled samples from 13 wells; 2421 samples without DT


[1;38;5;208mIf you are using MLflow Tracing, you can migrate your traces to Unity Catalog for unlimited storage, fine-grained access controls, and queryability from notebooks, SQL, and dashboards. [94mLearn more: https://docs.databricks.com/aws/en/mlflow3/genai/tracing/migrate-traces-to-uc[0m


  gardner_textbook     MAE  17.23  RMSE  22.25  R2 -1.542  bias +10.93 us/ft
  gardner_calibrated   MAE  10.68  RMSE  12.34  R2  0.219  bias  -0.92 us/ft
  faust_calibrated     MAE   6.64  RMSE   8.66  R2  0.615  bias  -0.54 us/ft
  linear_all_curves    MAE   3.00  RMSE   3.76  R2  0.927  bias  -0.01 us/ft
  model                MAE   3.05  RMSE   3.81  R2  0.925  bias  -0.01 us/ft
champion: linear_all_curves (ties within 2% go to the simpler model)


...
registered oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v2 @champion (run 11806608ec9f4301826a8a61d45cff3d)
GREENRIVER-03 synthetic sonic: 2373 samples, mean 76.0 us/ft
endpoint subsurface-synthetic-sonic -> oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v2 behind AI Gateway
```

## 2. Lakeflow pipeline: event log and data quality

Event log of the latest update (`event_log()`), first and last lines:
```text
timestamp | event_type | level | message
2026-10-21T17:04:47.780Z | user_action | INFO | Principal 'reishin.toolsi@databricks.com' started an update.
2026-10-21T17:04:47.790Z | create_update | INFO | Update 6eca92 started by JOB_TASK.
2026-10-21T17:04:49.588Z | update_progress | INFO | Update 6eca92 is WAITING_FOR_RESOURCES.
2026-10-21T17:04:54.944Z | runtime_details | INFO | Resolved runtime environment details for update 6eca92.
2026-10-21T17:05:00.235Z | update_progress | INFO | Update 6eca92 is INITIALIZING.
2026-10-21T17:05:15.994Z | user_code_context | INFO | User code context captured for this update.
2026-10-21T17:05:34.474Z | update_progress | INFO | Update 6eca92 is RESETTING.
2026-10-21T17:05:34.522Z | update_progress | INFO | Update 6eca92 is SETTING_UP_TABLES.
...
2026-10-21T17:06:04.384Z | dataset_life_cycle | INFO | Materialized View `oil_pump_monitor_catalog`.`subsurface_command`.`gold_zone_summary` has been created.
2026-10-21T17:06:04.436Z | flow_progress | INFO | Flow 'oil_pump_monitor_catalog.subsurface_command.gold_zone_summary' has COMPLETED.
2026-10-21T17:06:04.463Z | flow_progress | METRICS | Reported flow time metrics for flowName: 'oil_pump_monitor_catalog.subsurface_command.gold_sonic_features'.
2026-10-21T17:06:04.466Z | flow_progress | METRICS | Reported flow time metrics for flowName: 'oil_pump_monitor_catalog.subsurface_command.gold_zone_summary'.
2026-10-21T17:06:04.469Z | flow_progress | METRICS | Reported flow time metrics for flowName: 'pipelines.flowTimeMetrics.missingFlowName'.
2026-10-21T17:06:04.473Z | update_progress | INFO | Update 6eca92 is COMPLETED.
```

Row counts:
| Table | Rows |
|---|---|
| silver_logs | 35,014 |
| gold_zone_summary | 84 |
| gold_synthetic_sonic | 14,457 |
| bronze_logs | 35,014 |
| gold_petrophysics | 35,014 |
| gold_sonic_features | 33,610 |

Expectations recorded by the pipeline:
| Flow | Expectation | Passed | Failed |
|---|---|---|---|
| silver_wells | has_id | 14 | 0 |
| silver_wells | located | 14 | 0 |
| silver_logs | rt_positive | 35014 | 0 |
| silver_logs | rhob_in_range | 35014 | 0 |
| silver_logs | has_depth | 35014 | 0 |
| silver_logs | gr_in_range | 35014 | 0 |

## 3. MLflow run and Unity Catalog model

`oil_pump_monitor_catalog.subsurface_command.synthetic_sonic` v4 `@champion`, run `9d1636cb86c147d28909b8cd5576883d` (FINISHED, 2026-10-22 18:56:36 UTC). Logged metrics:

| Method | MAE us/ft | RMSE | R2 | Bias |
|---|---|---|---|---|
| gardner_textbook | 17.232 | 22.247 | -1.542 | 10.931 |
| gardner_calibrated | 10.683 | 12.336 | 0.219 | -0.918 |
| faust_calibrated | 6.642 | 8.657 | 0.615 | -0.535 |
| model | 3.046 | 3.815 | 0.925 | -0.006 |
| linear_all_curves | 3.003 | 3.763 | 0.927 | -0.005 |

## 4. Served model: live request, response, and AI Gateway inference table

Endpoint `subsurface-synthetic-sonic` READY, served entity oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v4, scale to zero True.

Request sent:
```json
{"columns": ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"], "data": [[102.73, 2.4317, 0.3325, 0.3171018123980051, 5000.0, 0], [92.41, 2.3675, 0.3273, 0.2901459546478102, 5002.0, 0], [102.02, 2.3952, 0.327, 0.33387027882600906, 5004.0, 0], [98.47, 2.3942, 0.3523, 0.15548786214128146, 5006.0, 0], [100.57, 2.4431, 0.313, 0.3844430240587781, 5008.0, 0], [87.94, 2.4408, 0.2898, 0.497316744472857, 5010.0, 0], [95.21, 2.4377, 0.2921, 0.4971923582535037, 5012.0, 0], [106.95, 2.487, 0.2901, 0.5597271274175609, 5014.0, 0]]}
```

Response received:
```json
{"predictions": [93.66, 95.2, 95.32, 95.95, 91.68, 88.48, 90.03, 89.23]}
```

Checked against measured sonic:
| MD ft | Measured DT | Predicted DT | Abs error |
|---|---|---|---|
| 5000.0 | 97.65 | 93.66 | 3.99 |
| 5002.0 | 98.82 | 95.2 | 3.62 |
| 5004.0 | 95.02 | 95.32 | 0.3 |
| 5006.0 | 96.64 | 95.95 | 0.69 |
| 5008.0 | 94.77 | 91.68 | 3.09 |
| 5010.0 | 88.03 | 88.48 | 0.45 |
| 5012.0 | 91.65 | 90.03 | 1.62 |
| 5014.0 | 90.33 | 89.23 | 1.1 |

Inference table rows logged by AI Gateway (`sonic_endpoint_payload`):
```text
logged_requests | http_200 | first_request | last_request
202 | 202 | 2026-10-21T17:32:54.403Z | 2026-10-22T17:51:36.184Z

Latest 8 rows (request and response truncated):
request_time | status_code | execution_duration_ms | request | response
2026-10-22T17:51:36.184Z | 200 | 1 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[94.98,2.4681,0.3088,0.4840292109404567, | {"predictions": [89.1330172748661, 88.72491548401781, 89.24698736125997, 89.04027294034817, 86.88547888665369, 88.890784
2026-10-22T17:50:17.523Z | 200 | 1 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[102.97,2.4357,0.3311,0.3215155814605326 | {"predictions": [93.40888742374686, 88.09133828235942, 90.45054095446453, 98.67670275962615, 97.53420916963792, 96.75889
2026-10-22T17:50:17.517Z | 200 | 1 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[94.98,2.4681,0.3088,0.4840292109404567, | {"predictions": [89.1330172748661, 88.72491548401781, 89.24698736125997, 89.04027294034817, 86.88547888665369, 88.890784
2026-10-22T17:50:17.431Z | 200 | 1 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[94.98,2.4681,0.3088,0.4840292109404567, | {"predictions": [89.1330172748661, 88.72491548401781, 89.24698736125997, 89.04027294034817, 86.88547888665369, 88.890784
2026-10-22T17:50:17.306Z | 200 | 2 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[102.73,2.4317,0.3325,0.3171018123980051 | {"predictions": [93.66124546597469, 95.19915161446086, 95.31897350248728, 95.95323053438429, 91.676846054185, 88.4758140
2026-10-22T17:50:17.064Z | 200 | 4 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[102.97,2.4357,0.3311,0.3215155814605326 | {"predictions": [93.40888742374686, 88.09133828235942, 90.45054095446453, 98.67670275962615, 97.53420916963792, 96.75889
2026-10-22T17:50:16.988Z | 200 | 2 | {"dataframe_split":{"columns":["gr_api","rhob_gcc","nphi_vv","log_rt","md_ft","zone_index"],"data":[[102.97,2.4357
```

## 5. Genie: H2S and glossary questions answered live

Genie space `01f17bdeaeee136fbd65013d3eb40261`, captured 2026-10-22T21:54 UTC. Full answers, SQL and rows: [`docs/evidence/16_h2s_proof_points.md`](docs/evidence/16_h2s_proof_points.md).

Iteration found by these proof points: on the first run Genie reported EASTTEXAS-05 as **high** severity because it read the HSE `h2s_risk_level` field instead of the governed severity band. The Genie instructions were updated to use `v_well_sour_band.severity_band` (the glossary's source for "Severity band"), and the re-run below reports **extreme**.

**Q1. Which wells are sour, and what is each one's H2S severity band and last measured ppm?** (COMPLETED, 18.9 s)

> The visible data shows **3 sour wells** with their H2S severity band and last measured ppm: - **EASTTEXAS-05** (East Texas 05): **extreme**, **12,000.0 ppm** - **PERMIAN-04** (Permian 04): **moderate**, **44.0 ppm** - **GREENRIVER-03** (Green River 03): **moderate**, **32.5 ppm**  Based on these results, **EASTTEXAS-05** is the clear outlier with a much higher H2S reading than the other two sour wells.

```sql
SELECT `well_id`, `well_name`, `basin`, `severity_band`, `h2s_ppm` AS `last_measured_ppm` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`v_well_sour_band` WHERE `sour_classified` = TRUE AND `severity_band` IS NOT NULL AND `h2s_ppm` IS NOT NULL ORDER BY `h2s_ppm` DESC
```

**Q2. Why is EASTTEXAS-05 flagged for an H2S safety audit? Show the rule, its glossary definition and the data behind it.** (COMPLETED, 25.8 s)

> **EASTTEXAS-05** is flagged by rule **R-H2S-AUDIT** (**H2S safety audit overdue**) because glossary term **H2S safety audit interval** requires an audit at least once a year, with a threshold of **365 days**, and **EASTTEXAS-05** shows **386 days** since the last safety audit on **2025-10-01**. The glossary definition says every sour well needs an on-site H2S safety audit at least once a year, and the supporting well data shows **h2s_ppm_last_measured = 12000.0**, **safety_status = critical**, **ppe_level = level-B**, **eeba_required = true**, and **h2s_measurement_date = 2025-11-14** (**342 days** ago), with the rule owned by **HSE** and sourced from **Company H2S standard**.

```sql
SELECT r.`rule_id`, r.`title`, g.`term`, g.`definition`, g.`threshold`, g.`threshold_value`, g.`owner`, g.`source`, h.`well_id`, h.`well_name`, h.`basin`, h.`h2s_ppm_last_measured`, h.`last_safety_audit_date`, DATEDIFF(CURRENT_DATE(), h.`last_safety_audit_date`) AS `days_since_audit`, h.`h2s_measurement_date`, DATEDIFF(CURRENT_DATE(), h.`h2s_measurement_date`) AS `days_since_h2s_test`, h.`safety_status`, h.`ppe_level`, h.`eeba_required` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`engineer_rules` r JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`business_glossary` g ON g.`term` = r.`glossary_term` CROSS JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`well_h2s_profile` h WHERE r.`rule_id` = 'R-H2S-AUDIT' AND h.`well_id` = 'EASTTEXAS-05'
```

**Q3. What does the glossary say the H2S re-sample interval is, and which wells are overdue?** (COMPLETED, 24.3 s)

> The glossary says the **H2S re-sample interval** is **180 days**: H2S in the production stream must be re-measured on sour wells at least every six months. The overdue wells are **PERMIAN-04** (**185 days overdue**), **EASTTEXAS-05** (**162 days overdue**), and **GREENRIVER-03** (**143 days overdue**). Among these 3 overdue wells, **EASTTEXAS-05** stands out as the most severe case with **12,000 ppm** and an **extreme** severity band.

```sql
-- ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.

WITH rule_glossary AS (
  SELECT
    r.rule_id,
    r.title,
    g.term,
    g.definition,
    g.threshold,
    g.threshold_value,
    g.owner,
    g.source
  FROM oil_pump_monitor_catalog.subsurface_command.engineer_rules r
  INNER JOIN oil_pump_monitor_catalog.subsurface_command.business_glossary g
    ON g.term = r.glossary_term
  WHERE r.rule_id = 'R-H2S-SAMPLE'
)
SELECT
  rg.rule_id,
  rg.title,
  rg.term,
  rg.definition,
  rg.threshold,
  rg.threshold_value,
  rg.owner,
  rg.source,
  h.well_id,
  h.well_name,
  h.basin,
  v.severity_band,
  h.h2s_ppm_last_measured,
  h.h2s_measurement_date,
  DATEDIFF(current_date(), h.h2s_measurement_date) AS days_since_h2s_test,
  DATEDIFF(current_date(), h.h2s_measurement_date) - CAST(rg.threshold_value AS INT) AS days_overdue,
  h.ppe_level,
  h.eeba_required,
  h.safety_status
FROM oil_pump_monitor_catalog.subsurface_command.well_h2s_profile h
INNER JOIN oil_pump_monitor_catalog.subsurface_command.v_well_sour_band v
  ON v.well_id = h.well_id
CROSS JOIN rule_glossary rg
WHERE h.sour_classified = TRUE
  AND h.h2s_measurement_date IS NOT NULL
  AND v.severity_band IS NOT NULL
  AND h.h2s_ppm_last_measured IS NOT NULL
  AND DATEDIFF(current_date(), h.h2s_measurement_date) > CAST(rg.threshold_value AS INT)
ORDER BY days_overdue DESC, h.h2s_ppm_last_measured DESC
```

**Q4. What sour-service equipment does EASTTEXAS-05 need, and what is the longest lead time?** (COMPLETED, 25.2 s)

> EASTTEXAS-05 has **8** required sour-service equipment upgrades, and the **longest lead time is 24 weeks** for **ESP pump & motor metallurgy** with a required spec of **Full Inconel / Hastelloy wetted path**. Examples include: - **ESP pump & motor metallurgy** — **24 weeks** - **Wellhead & Christmas tree** — **22 weeks** - **Flowlines & gathering** — **20 weeks** - **Valves & BOP stack** — **20 weeks** - **Production tubulars / casing** — **18 weeks** The lead times range from **6 to 24 weeks**, with the highest-risk items clustered among the longer-lead upgrades.

**Q5. Which wellhead and casing parts will stock out before a reorder arrives?** (COMPLETED, 18.5 s)

> **3 parts** in the **Wellhead** and **Casing** categories will run out before a reorder arrives based on current usage and lead times. The most urgent are **13-3/8in casing joint** with **7.2 days** of cover versus **35 days** lead time, **Wellhead spool** with **20.0 days** versus **60 days**, and **BOP ram seal kit** with **25.0 days** versus **28 days**; among these, the casing joint is the tightest shortage risk.

**Q6. What do the engineer action rules mean, and who owns each threshold?** (COMPLETED, 18.9 s)

> The engineer action rules in the catalog are all owned operationally by the **Production engineer**, while the threshold definitions are owned by **Finance**, **Supply chain**, **HSE**, or **Production engineering** depending on the rule. Examples include: - **R-ECON-SOURCAPEX** — threshold owner: **Finance**; trigger: **>= 10% of NPV10** - **R-EQ-LONGLEAD** — threshold owner: **Supply chain**; trigger: **risk score >= 90 and lead >= 18 weeks** - **R-H2S-AUDIT** — threshold owner: **HSE**; trigger: **365 days** - **R-H2S-SAMPLE** — threshold owner: **Production engineering**; trigger: **180 days** - **R-INV-COVER** — threshold owner: **Supply chain**; trigger: **days of cover < lead time**  

**Q7. How much sour-service upgrade capex does EASTTEXAS-05 carry relative to its live NPV?** (COMPLETED, 24.4 s)

> For well **EASTTEXAS-05** (East Texas 05) in **East Texas**, total sour-service upgrade capex is **14.35 MUSD** against live NPV of **129.85 MUSD**, which is **11.05%** of live NPV. This means well **EASTTEXAS-05** is carrying sour-service upgrade capex equal to about **0.111x** its live NPV.

**Q8. What PPE and monitoring does EASTTEXAS-05 require?** (COMPLETED, 19.1 s)

> For well **EASTTEXAS-05**, the required protection and monitoring are **PPE level-B**, **continuous monitoring = true**, **EEBA required = true**, **H2S training required = true**, and **H2S monitor alarm = 10 ppm**. As added context for operations, well **EASTTEXAS-05** is **sour_classified = true**, has **h2s_ppm_last_measured = 12000.0**, and has **safety_status = critical**.

Direct queries over the governed glossary:

*The rule catalog: each rule with its glossary definition, owner, live threshold and open items today*

| rule_id | rule_title | glossary_term | threshold_value | definition_owner | open_items_today |
|---|---|---|---|---|---|
| R-ECON-SOURCAPEX | Sour capex material to the AFE | Sour capex materiality | 10.0 | Finance | 2 |
| R-EQ-LONGLEAD | Long-lead sour components not on order | Long-lead sour component | 18.0 | Supply chain | 1 |
| R-H2S-AUDIT | H2S safety audit overdue | H2S safety audit interval | 365.0 | HSE | 2 |
| R-H2S-SAMPLE | H2S re-sample overdue | H2S re-sample interval | 180.0 | Production engineering | 3 |
| R-INV-COVER | Sour-critical parts will stock out | Days of cover |  | Supply chain | 3 |
| R-SAF-CRIT | Critical H2S safety status | Sour service | 100.0 | HSE | 1 |

*Glossary terms attached to the columns they govern (Unity Catalog column tags)*

| term | owner | threshold | governs |
|---|---|---|---|
| Days of cover | Supply chain | days of cover < lead time | drilling_inventory.on_hand_qty, drilling_inventory.lead_time_days |
| H2S re-sample interval | Production engineering | 180 days | well_h2s_profile.h2s_measurement_date |
| H2S safety audit interval | HSE | 365 days | well_h2s_profile.last_safety_audit_date |
| Long-lead sour component | Supply chain | risk_score >= 90 and lead >= 18 weeks | equipment_component_spec.lead_weeks |
| Severity band | Engineering | sweet / low / moderate / high / extreme | equipment_component_spec.band |
| Sour capex materiality | Finance | >= 10% of NPV10 | well_economics.npv10_live_musd |
| Sour service | HSE | H2S >= 100 ppm or sour_classified | well_h2s_profile.sour_classified, well_h2s_profile.h2s_ppm_last_measured |

*The H2S safety audit rule evaluated live, reading its threshold from the glossary*

| well_id | h2s_ppm_last_measured | last_safety_audit_date | days_since_audit | glossary_interval_days | threshold_owner | overdue |
|---|---|---|---|---|---|---|
| PERMIAN-04 | 44.0 | 2025-09-30 | 387 | 365.0 | HSE | true |
| EASTTEXAS-05 | 12000.0 | 2025-10-01 | 386 | 365.0 | HSE | true |
| GREENRIVER-03 | 32.5 | 2025-11-15 | 341 | 365.0 | HSE | false |

## 6. Unity Catalog policy: same query, same user, before and after mapping a JV partner

| View | Rows | Basins | Sw visible | HC pore ft visible |
|---|---|---|---|---|
| Operator | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |
| JV partner, San Juan | 30 | San Juan | 0 | 0 |
| Restored | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |

Equipment and H2S tables under the same policy (H2S ppm deliberately visible):
| Object | View | Rows | Basins | H2S ppm visible | Capex visible | Risk/notes visible |
|---|---|---|---|---|---|---|
| well_equipment_integrity (view) | Operator | 48 | East Texas,Green River,Permian Basin,San Juan | 48 | 48 | 48 |
| well_h2s_profile (table) | Operator | 6 | East Texas,Green River,Permian Basin,San Juan | 6 |  | 6 |
| well_equipment_integrity (view) | JV partner | 16 | San Juan | 16 | 0 | 0 |
| well_h2s_profile (table) | JV partner | 2 | San Juan | 2 |  | 0 |

## 7. Drift checks and automatic retrains (job output)

`10_drift_check_1073184097010007__drift_check.txt`: task drift_check, task run 168250438617897, SUCCESS, 2026-10-22 15:00:57 UTC to 2026-10-22 15:02:33 UTC
```text
EASTTEXAS-05                 n= 1203  model   2.85  gardner  10.30  bar  4.50  ok
ET-OFFSET-08                 n= 2396  model   3.28  gardner  10.24  bar  4.50  ok
GR-OFFSET-04                 n= 2385  model   3.22  gardner  10.89  bar  4.50  ok
GR-OFFSET-05                 n= 2395  model   2.54  gardner  10.44  bar  4.50  ok
PB-OFFSET-06                 n= 2392  model   2.61  gardner   9.91  bar  4.50  ok
PB-OFFSET-07                 n= 2389  model   2.52  gardner  10.89  bar  4.50  ok
PERMIAN-04                   n= 1218  model   2.63  gardner  10.89  bar  4.50  ok
PERMIAN-06                   n= 1206  model   2.76  gardner  10.36  bar  4.50  ok
SANJUAN-01                   n= 1212  model   2.60  gardner  11.23  bar  4.50  ok
SANJUAN-02                   n= 2388  model   4.21  gardner  11.55  bar  4.50  ok
SJ-OFFSET-01                 n= 2357  model   3.72  gardner  10.85  bar  4.50  ok
SJ-OFFSET-02                 n= 1207  model   2.74  gardner  10.31  bar  4.50  ok
SJ-OFFSET-03                 n= 2396  model   2.49  gardner  11.13  bar  4.50  ok
check e6333cc4-fe58-4a39-a630-484d93049556: 0 of 13 wells in drift; action: none
```

`10_drift_check_243464966359023__drift_check.txt`: task drift_check, task run 763605210412892, SUCCESS, 2026-10-22 18:54:44 UTC to 2026-10-22 18:55:37 UTC
```text
EASTTEXAS-05                 n= 1203  model   2.85  gardner  10.30  bar  4.50  ok
ET-OFFSET-08                 n= 2396  model   3.28  gardner  10.24  bar  4.50  ok
GR-OFFSET-04                 n= 2385  model   3.22  gardner  10.89  bar  4.50  ok
GR-OFFSET-05                 n= 2395  model   2.54  gardner  10.44  bar  4.50  ok
NEW-PERMIAN-06-GRx1.3        n= 1206  model   4.56  gardner  10.36  bar  4.50  DRIFT
PB-OFFSET-06                 n= 2392  model   2.61  gardner   9.91  bar  4.50  ok
PB-OFFSET-07                 n= 2389  model   2.52  gardner  10.89  bar  4.50  ok
PERMIAN-04                   n= 1218  model   2.63  gardner  10.89  bar  4.50  ok
PERMIAN-06                   n= 1206  model   2.76  gardner  10.36  bar  4.50  ok
SANJUAN-01                   n= 1212  model   2.60  gardner  11.23  bar  4.50  ok
SANJUAN-02                   n= 2388  model   4.21  gardner  11.55  bar  4.50  ok
SJ-OFFSET-01                 n= 2357  model   3.72  gardner  10.85  bar  4.50  ok
SJ-OFFSET-02                 n= 1207  model   2.74  gardner  10.31  bar  4.50  ok
SJ-OFFSET-03                 n= 2396  model   2.49  gardner  11.13  bar  4.50  ok
check 357f4095-88a3-407a-8f1c-c6a82e79f04e: 1 of 14 wells in drift; action: retrain triggered: subsurface-command-build run 730433284449926 (train_serve_score)
```

`10_drift_check_535891804033679__drift_check.txt`: task drift_check, task run 532928821222443, SUCCESS, 2026-10-22 15:02:53 UTC to 2026-10-22 15:03:45 UTC
```text
EASTTEXAS-05                 n= 1203  model   2.85  gardner  10.30  bar  4.50  ok
ET-OFFSET-08                 n= 2396  model   3.28  gardner  10.24  bar  4.50  ok
GR-OFFSET-04                 n= 2385  model   3.22  gardner  10.89  bar  4.50  ok
GR-OFFSET-05                 n= 2395  model   2.54  gardner  10.44  bar  4.50  ok
NEW-SANJUAN-01-NPHI+0.12     n= 1212  model   5.38  gardner  11.23  bar  4.50  DRIFT
PB-OFFSET-06                 n= 2392  model   2.61  gardner   9.91  bar  4.50  ok
PB-OFFSET-07                 n= 2389  model   2.52  gardner  10.89  bar  4.50  ok
PERMIAN-04                   n= 1218  model   2.63  gardner  10.89  bar  4.50  ok
PERMIAN-06                   n= 1206  model   2.76  gardner  10.36  bar  4.50  ok
SANJUAN-01                   n= 1212  model   2.60  gardner  11.23  bar  4.50  ok
SANJUAN-02                   n= 2388  model   4.21  gardner  11.55  bar  4.50  ok
SJ-OFFSET-01                 n= 2357  model   3.72  gardner  10.85  bar  4.50  ok
SJ-OFFSET-02                 n= 1207  model   2.74  gardner  10.31  bar  4.50  ok
SJ-OFFSET-03                 n= 2396  model   2.49  gardner  11.13  bar  4.50  ok
check 0666555a-16b4-4884-8149-41b641d99a01: 1 of 14 wells in drift; action: retrain triggered: subsurface-command-build run 753993907816317 (train_serve_score)
```

`10_drift_triggered_retrain__train_serve_score.txt`: subsurface-command-build: retrain triggered by the drift check; task train_serve_score, task run 244920454748527, SUCCESS, 2026-10-22 15:03:35 UTC to 2026-10-22 15:16:55 UTC
```text
  gardner_textbook     MAE  17.23  RMSE  22.25  R2 -1.542  bias +10.93 us/ft
  gardner_calibrated   MAE  10.68  RMSE  12.34  R2  0.219  bias  -0.92 us/ft
  faust_calibrated     MAE   6.64  RMSE   8.66  R2  0.615  bias  -0.54 us/ft
  linear_all_curves    MAE   3.00  RMSE   3.76  R2  0.927  bias  -0.01 us/ft
  model                MAE   3.05  RMSE   3.81  R2  0.925  bias  -0.01 us/ft
champion: linear_all_curves (ties within 2% go to the simpler model)
registered oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v3 @champion (run b9412f716a8b4cf5bdbfa5ffccb21843)
endpoint subsurface-synthetic-sonic -> oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v3 behind AI Gateway
```

`10_drift_triggered_retrain_gr__train_serve_score.txt`: subsurface-command-build: retrain triggered by the gamma-ray drift check; task train_serve_score, task run 265260219332607, SUCCESS, 2026-10-22 18:55:26 UTC to 2026-10-22 19:07:19 UTC
```text
  gardner_textbook     MAE  17.23  RMSE  22.25  R2 -1.542  bias +10.93 us/ft
  gardner_calibrated   MAE  10.68  RMSE  12.34  R2  0.219  bias  -0.92 us/ft
  faust_calibrated     MAE   6.64  RMSE   8.66  R2  0.615  bias  -0.54 us/ft
  linear_all_curves    MAE   3.00  RMSE   3.76  R2  0.927  bias  -0.01 us/ft
  model                MAE   3.05  RMSE   3.81  R2  0.925  bias  -0.01 us/ft
champion: linear_all_curves (ties within 2% go to the simpler model)
registered oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v4 @champion (run 9d1636cb86c147d28909b8cd5576883d)
endpoint subsurface-synthetic-sonic -> oil_pump_monitor_catalog.subsurface_command.synthetic_sonic v4 behind AI Gateway
```

## 8. Decision brief: eval set and a captured brief

```text
# Decision brief eval history, read from oil_pump_monitor_catalog.subsurface_command.gold_brief_eval
# Run 1: before the fix. Run 2: self-correction also enforces citations and length. Run 3: up to two correction passes.

run_id | ran_at | cases | passed | grounded | self_corrected
257aadfb-3b20-4b7f-90f6-6ecfa3069309 | 2026-10-22T18:58:04.498Z | 5 | 3 | 5 | 2
bb2ecc78-ed66-400d-93b7-689030979084 | 2026-10-22T19:02:01.919Z | 5 | 4 | 5 | 3
2d6b706f-68c0-4c2d-8c2f-868414c46882 | 2026-10-22T19:05:52.092Z | 5 | 5 | 5 | 2
```

| Well | Grounded | First draft grounded | Figures checked | Facts cited | Words | Pass |
|---|---|---|---|---|---|---|
| SANJUAN-01 | True | False | 23 | 11/12 | 230 | True |
| GREENRIVER-03 | True | True | 19 | 10/12 | 203 | True |
| PERMIAN-04 | True | True | 20 | 12/12 | 228 | True |
| EASTTEXAS-05 | True | True | 22 | 11/12 | 221 | True |
| PERMIAN-06 | True | True | 21 | 6/12 | 203 | True |

Brief for SANJUAN-01 by `databricks-claude-sonnet-4-5`: 23 figures checked, 0 unsupported, logged to `oil_pump_monitor_catalog.subsurface_command.gold_action_plans`.

> **Recommendation**
>
> Approve the step-out well 2,616 ft from SANJUAN-01 in the Blanco field with $58M capex for drilling in the current program [F1, F6].
>
> **Why this well**
>
> • Risked economics deliver $40.3M NPV10, 34% IRR, and 2.0 yr payback at $79.18 WTI with $53 break-even [F5, F6].
>
> • Voxel model shows 253.0 ft hydrocarbon pore thickness vs 238.6 ft at SANJUAN-01, supporting comparable or better reservoir quality [F2].
>
> • Synthetic-sonic model demonstrates 3.0 us/ft accuracy on held-out wells, significantly outperforming calibrated Gardner at 10.7 us/ft [F9].
>
> **Why now**
>
> • Six-month delay costs $1.9M of risked NPV at 10% discount [F8].
>
> • Structural closure of 158 ft and 140 ft normal fault with free-water level at 9275 ft define a proven trap [F10].
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty reflected in 0.68 model confidence reduces pore thickness from 253.0 ft unrisked to 167.5 ft risked [F2, F3].
>
> • H2S risk is low at 1.2 ppm last measured; NACE MR0175 not required, and sour-service equipment adds $0.00M capex with 0 weeks lead time [F11, F12].
>
> **Next actions**
>
> • **Asset team**: Finalize AFE and secure rig contract.
>
> • **VP of Engineering**: Confirm wellbore design matches offset SANJUAN-01 specifications.
>
> • **SVP Digital Operations**: Commission pre-drill uncertainty quantification to refine risked thickness.

## 9. Engineer morning briefing on the H2S well

6 governed rules over 7 glossary terms: **8 open items on EASTTEXAS-05**, 4 on GREENRIVER-03, PERMIAN-04.

| Rule | Severity | Well | Evidence |
|---|---|---|---|
| R-H2S-AUDIT | critical | EASTTEXAS-05 | Last audit 2025-10-01, 386 days ago (interval 365 days); 12000.0 ppm, safety status critical |
| R-SAF-CRIT | critical | EASTTEXAS-05 | 12000.0 ppm, alarm at 10 ppm, PPE level-B, EEBA required true, continuous monitor true |
| R-EQ-LONGLEAD | high | EASTTEXAS-05 | 5 components at risk 90+ with 18+ week lead: Production tubulars / casing 18 wk; Wellhead & Christmas tree 22  |
| R-H2S-SAMPLE | high | EASTTEXAS-05 | Last measured 2025-11-14, 342 days ago (interval 180 days) at 12000.0 ppm |
| R-INV-COVER | high | EASTTEXAS-05 | P-002: 18 jt on hand at 2.50/day = 7.2 days of cover vs 35 day lead time (Tubular Supplier) |
| R-INV-COVER | high | EASTTEXAS-05 | P-005: 5 kit on hand at 0.20/day = 25.0 days of cover vs 28 day lead time (Wellhead Supplier) |
| R-INV-COVER | high | EASTTEXAS-05 | P-008: 1 ea on hand at 0.05/day = 20.0 days of cover vs 60 day lead time (Wellhead Supplier) |
| R-ECON-SOURCAPEX | medium | EASTTEXAS-05 | $14.35M upgrade capex is 11.1% of the well live NPV10 of $129.9M |

Glossary threshold drives the briefing: H2S safety audit interval 365 days gives 2 audit items; raised to 400 through the app, 0; restored, 2.

Agent note (`databricks-claude-sonnet-4-5`, 13 figures checked, 0 unsupported):

> The H2S safety audit is 386 days overdue with the well at 12000.0 ppm requiring PPE level-B and EEBA [A1][A2], and the H2S re-sample is 342 days overdue [A4], making safety compliance the immediate priority. Three sour-critical parts face imminent stockouts: P-002 has only 7.2 days of cover against 35 day lead time, P-005 has 25.0 days versus 28 day lead, and P-008 has 20.0 days versus 60 day lead [A5][A6][A7]. Five long-lead sour components totaling $12.60M remain unordered despite 18+ week delivery times, including Production tubulars / casing at 18 wk, Wellhead & Christmas tree at 22 wk, and ESP pump & motor metallurgy at 24 wk [A3].

Ticket round trip: `SUB-57FDED` created through the app and read back from `engineer_tickets`: `[{'ticket_id': 'SUB-57FDED', 'created_by': 'reishin.toolsi@databricks.com', 'rule_id': 'R-INV-COVER', 'well_id': 'EASTTEXAS-05', 'title': 'Reorder ticket: EASTTEXAS-05 13-3/8in casing joint', 'status': 'open'}]`.

## 10. Ontology read back from Unity Catalog

| Glossary term | Governs columns |
|---|---|
| Days of cover | drilling_inventory.on_hand_qty, drilling_inventory.lead_time_days |
| H2S re-sample interval | well_h2s_profile.h2s_measurement_date |
| H2S safety audit interval | well_h2s_profile.last_safety_audit_date |
| Long-lead sour component | equipment_component_spec.lead_weeks |
| Severity band | equipment_component_spec.band |
| Sour capex materiality | well_economics.npv10_live_musd |
| Sour service | well_h2s_profile.sour_classified, well_h2s_profile.h2s_ppm_last_measured |

| From | Constraint | To |
|---|---|---|
| engineer_rules | rules_glossary_fk | business_glossary |
| engineer_tickets | tickets_rule_fk | engineer_rules |
| engineer_tickets | tickets_well_fk | operator_wells |
| well_distances | dist_to_fk | operator_wells |
| well_distances | dist_from_fk | operator_wells |
| well_economics | econ_well_fk | operator_wells |
| well_h2s_profile | h2s_well_fk | operator_wells |

## 11. Audit trail from `system.access.audit`

```text
at | who | action | object | status
2026-10-22 18:57 | reishin.toolsi@databricks.com | updateTables | equipment_component_spec | 200
2026-10-22 18:57 | reishin.toolsi@databricks.com | getTable | equipment_component_spec | 200
2026-10-22 18:57 | reishin.toolsi@databricks.com | updateTables | equipment_component_spec | 200
2026-10-22 18:57 | reishin.toolsi@databricks.com | getTable | equipment_component_spec | 200
2026-10-22 18:57 | reishin.toolsi@databricks.com | updateTables | well_h2s_profile | 200
2026-10-22 18:57 | reishin.toolsi@databricks.com | getTable | well_h2s_profile | 200
2026-10-22 18:56 | reishin.toolsi@databricks.com | updateTables | well_h2s_profile | 200
2026-10-22 18:56 | reishin.toolsi@databricks.com | getTable | well_h2s_profile | 200
2026-10-22 17:52 | reishin.toolsi@databricks.com | getTable | engineer_rules | 200
2026-10-22 17:52 | reishin.toolsi@databricks.com | getTable | well_h2s_profile | 200
2026-10-22 17:52 | reishin.toolsi@databricks.com | getTable | business_glossary | 200
2026-10-22 17:52 | reishin.toolsi@databricks.com | getTable | gold_zone_summary | 200
2026-10-22 17:52 | reishin.toolsi@databricks.com | getTable | business_glossary | 200
2026-10-22 17:51 | reishin.toolsi@databricks.com | updateTables | access_personas | 200
2026-10-22 17:51 | reishin.toolsi@databricks.com | getTable | access_personas | 200
2026-10-22 17:51 | reishin.toolsi@databricks.com | getTable | access_personas | 200
2026-10-22 17:51 | reishin.toolsi@databricks.com | getTable | access_personas | 200
2026-10-22 17:50 | reishin.toolsi@databricks.com | getTable | well_h2s_profile | 200
2026-10-22 17:50 | reishin.toolsi@databricks.com | getTable | engineer_rules | 200
2026-10-22 17:50 | reishin.toolsi@databricks.com | getTable | business_glossary | 200
2026-10-22 17:50 | reishin.toolsi@databricks.com | getTable | gold_zone_summary | 200
```

## 12. Test suite

```text
============================= test session starts ==============================
platform darwin -- Python 3.12.12, pytest-9.0.2, pluggy-1.6.0 -- /Users/reishin.toolsi/cognitive-subsurface/.venv/bin/python
cachedir: .pytest_cache
rootdir: /Users/reishin.toolsi/drilling-command-center
collecting ... collected 31 items

tests/test_app.py::test_paths_exist[app.py] PASSED                       [  3%]
tests/test_app.py::test_paths_exist[app.yaml] PASSED                     [  6%]
tests/test_app.py::test_paths_exist[requirements.txt] PASSED             [  9%]
tests/test_app.py::test_paths_exist[databricks.yml] PASSED               [ 12%]
tests/test_app.py::test_paths_exist[server] PASSED                       [ 16%]
tests/test_app.py::test_paths_exist[frontend] PASSED                     [ 19%]
tests/test_app.py::test_paths_exist[pipelines/subsurface_pipeline.py] PASSED [ 22%]
tests/test_app.py::test_paths_exist[ml/train_synthetic_sonic.py] PASSED  [ 25%]
tests/test_app.py::test_paths_exist[ml/metrics.json] PASSED              [ 29%]
tests/test_app.py::test_paths_exist[governance/policies.sql] PASSED      [ 32%]
tests/test_app.py::test_paths_exist[docs/TALK-TRACK.md] PASSED           [ 35%]
tests/test_app.py::test_npv_matches_uc_function PASSED                   [ 38%]
tests/test_app.py::test_npv_is_zero_at_break_even PASSED                 [ 41%]
tests/test_app.py::test_irr_found_for_every_fleet_well[65-4.8-2100-15] PASSED [ 45%]
tests/test_app.py::test_irr_found_for_every_fleet_well[72-5.2-3200-28] PASSED [ 48%]
tests/test_app.py::test_irr_found_for_every_fleet_well[58-4.1-1800-18] PASSED [ 51%]
tests/test_app.py::test_irr_found_for_every_fleet_well[52-3.8-1500-20] PASSED [ 54%]
tests/test_app.py::test_irr_found_for_every_fleet_well[44-3.2-1400-22] PASSED [ 58%]
tests/test_app.py::test_irr_found_for_every_fleet_well[48-3.5-1200-25] PASSED [ 61%]
tests/test_app.py::test_payback_within_project_life PASSED               [ 64%]
tests/test_app.py::test_voxel_model_shape_and_ranges PASSED              [ 67%]
tests/test_app.py::test_voxel_model_is_deterministic PASSED              [ 70%]
tests/test_app.py::test_step_out_respects_ranking_rules PASSED           [ 74%]
tests/test_app.py::test_saturation_height_function PASSED                [ 77%]
tests/test_app.py::test_rule_sql_guard_allows_select_with_semicolons_in_literals PASSED [ 80%]
tests/test_app.py::test_rule_sql_guard_blocks_writes[DELETE FROM t] PASSED [ 83%]
tests/test_app.py::test_rule_sql_guard_blocks_writes[SELECT 1; DROP TABLE t] PASSED [ 87%]
tests/test_app.py::test_rule_sql_guard_blocks_writes[SELECT 1 FROM t; DELETE FROM t] PASSED [ 90%]
tests/test_app.py::test_rule_sql_guard_blocks_writes[UPDATE t SET x = 1] PASSED [ 93%]
tests/test_app.py::test_rule_sql_guard_blocks_writes[SELECT * FROM t WHERE 1 = 1 GRANT] PASSED [ 96%]
tests/test_app.py::test_validator_ignores_ids_and_catches_invented_figures PASSED [100%]

============================== 31 passed in 0.45s ==============================
```

## 13. Workspace notebook run

`notebooks/evidence_run.py` ran as serverless job run 1025664438265546; its exit value:
```json
{
  "model": {
    "version": 2,
    "run_id": "11806608ec9f4301826a8a61d45cff3d",
    "champion_mae": 3.003,
    "gardner_calibrated_mae": 10.683
  },
  "serving": {
    "n": 10,
    "mean_abs_error": 1.76
  },
  "genie": [
    {
      "q": "Which basin has the highest total live NPV?",
      "a": "The basin with the **highest** total live NPV is **San Juan**, with **155.92 million USD** in total live NPV. Based on the result shown, **San Juan** is the top-ranked basin on this measure."
    },
    {
      "q": "Which wells are within 50 km of SANJUAN-01 and how far are they?",
      "a": "Within 50 km of **SANJUAN-01**, the only well shown is **SANJUAN-02** (**San Juan 02**) in the **San Juan** basin at **7.4 km** away, with **same_basin = true**. Based on the 1 row returned, **SANJUAN-02** is both the nearest and only listed nearby well in this result."
    },
    {
      "q": "What is the net pay in the Westwater formation for GREENRIVER-03?",
      "a": "For well **GREENRIVER-03** in the **Westwater** formation, **net pay is 1,140.0 ft**. As context, **gross interval is 1,200.0 ft** and **net-to-gross is 0.95**, which indicates most of the Westwater interval is counted as pay in **GREENRIVER-03**."
    }
  ]
}
```
