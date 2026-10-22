# Execution evidence

Captured from the live FEVM workspace on 2026-10-22 16:04 UTC by `scripts/collect_evidence.py`. Every number below comes from the JSON files in this folder, which hold the raw API responses.

## 1. Bundle job run (`01_job_run.json`)

Job `subsurface-command-build` (532814868767936), run 739091380836337: **SUCCESS**, 2026-10-21 17:04:05 UTC to 2026-10-21 17:32:31 UTC.

| Task (in run order) | Attempt | Result | Duration |
|---|---|---|---|
| land_raw | 0 | SUCCESS | 35.3 s |
| policies | 0 | SUCCESS | 39.6 s |
| medallion | 0 | SUCCESS | 82.9 s |
| train_serve_score | 0 | FAILED | 22.9 s |
| train_serve_score | 1 | FAILED | 25.2 s |
| train_serve_score | 2 | SUCCESS | 714.1 s |
| train_serve_score | 3 | SUCCESS | 692.7 s |

The run was repaired in place: the first training attempts failed because the serverless training environment was missing numpy and scipy, and passed once they were added. Earlier runs of the job (SUCCESS, FAILED, CANCELED) stopped on a semicolon inside a SQL comment that broke the statement splitter; that was fixed before this run.

## 2. Lakeflow pipeline (`02_pipeline.json`)

Pipeline `subsurface-command-pipeline` (95216d7e-1691-44ee-bc12-ab02ee7d6225), latest update **COMPLETED**.

| Table | Rows |
|---|---|
| silver_logs | 35,014 |
| gold_zone_summary | 84 |
| gold_synthetic_sonic | 14,457 |
| bronze_logs | 35,014 |
| gold_petrophysics | 35,014 |
| gold_sonic_features | 33,610 |

Data-quality expectations recorded in the pipeline event log (spikes and gaps are nulled and flagged in silver, not dropped, so every sample passes the row-level rules):

| Flow | Expectation | Passed | Failed |
|---|---|---|---|
| oil_pump_monitor_catalog.subsurface_command.silver_wells | has_id | 14 | 0 |
| oil_pump_monitor_catalog.subsurface_command.silver_wells | located | 14 | 0 |
| oil_pump_monitor_catalog.subsurface_command.silver_logs | rt_positive | 35014 | 0 |
| oil_pump_monitor_catalog.subsurface_command.silver_logs | rhob_in_range | 35014 | 0 |
| oil_pump_monitor_catalog.subsurface_command.silver_logs | has_depth | 35014 | 0 |
| oil_pump_monitor_catalog.subsurface_command.silver_logs | gr_in_range | 35014 | 0 |

## 3. MLflow training run and UC model (`03_mlflow_run.json`)

`oil_pump_monitor_catalog.subsurface_command.synthetic_sonic` version **3** `@champion`, from run `synthetic-sonic` (b9412f716a8b4cf5bdbfa5ffccb21843), FINISHED, 2026-10-22 15:05:10 UTC.

Logged leave-one-well-out metrics (us/ft):

| Metric | Value |
|---|---|
| faust_calibrated_bias | -0.5353 |
| faust_calibrated_mae | 6.6418 |
| faust_calibrated_r2 | 0.6152 |
| faust_calibrated_rmse | 8.6566 |
| gardner_calibrated_bias | -0.9184 |
| gardner_calibrated_mae | 10.6833 |
| gardner_calibrated_r2 | 0.2186 |
| gardner_calibrated_rmse | 12.3358 |
| gardner_textbook_bias | 10.9306 |
| gardner_textbook_mae | 17.232 |
| gardner_textbook_r2 | -1.5415 |
| gardner_textbook_rmse | 22.2468 |
| linear_all_curves_bias | -0.0053 |
| linear_all_curves_mae | 3.0026 |
| linear_all_curves_r2 | 0.9273 |
| linear_all_curves_rmse | 3.7626 |
| model_bias | -0.0057 |
| model_mae | 3.0457 |
| model_r2 | 0.9253 |
| model_rmse | 3.8147 |

## 4. Served model and AI Gateway (`04_serving.json`)

Endpoint `subsurface-synthetic-sonic` **READY**, live call returned 8 predictions in 0.174 s. On SANJUAN-01 samples with measured sonic:

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

AI Gateway: usage tracking on, rate limit 600 calls/min, inference table `sonic_endpoint_payload`: 185 logged requests (185 HTTP 200) from 2026-10-21T17:32:54.403Z to 2026-10-22T15:38:44.291Z.

## 5. Genie conversation (`05_genie_conversation.json`)

**Q: Which basin has the highest total live NPV?** (COMPLETED, 25.8 s)

A: The basin with the **highest** total live NPV is **San Juan**, with total live NPV of **155.92 million USD**. Based on the result shown, **San Juan** is the top basin on this measure.

```sql
WITH basin_npv AS (
  SELECT
    well_economics.basin,
    SUM(well_economics.npv10_live_musd) AS total_live_npv_musd
  FROM oil_pump_monitor_catalog.subsurface_command.well_economics
  WHERE well_economics.status IN ('gold', 'qc_complete', 'corrected')
    AND well_economics.basin IS NOT NULL
    AND well_economics.npv10_live_musd IS NOT NULL
  GROUP BY well_economics.basin
)
SELECT basin, total_live_npv_musd
FROM basin_npv
WHERE total_live_npv_musd = (
  SELECT MAX(total_live_npv_musd) FROM basin_npv
)
```

Rows: `[{"basin": "San Juan", "total_live_npv_musd": "155.92000000000002"}]`

**Q: Which wells are within 50 km of SANJUAN-01 and how far are they?** (COMPLETED, 24.5 s)

A: Within 50 km of **SANJUAN-01**, the visible result shows **SANJUAN-02** (**San Juan 02**) at **7.4 km** in the **San Juan** basin, with **same_basin = true**. Based on the returned data, **SANJUAN-02** is the nearby well shown and it is in the same basin as **SANJUAN-01**.

```sql
SELECT `to_well` AS `well_id`, `to_name` AS `well_name`, `to_basin` AS `basin`, ROUND(`km`, 1) AS `km`, `same_basin` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_distances` WHERE `from_well` = 'SANJUAN-01' AND `km` <= 50 AND `to_well` <> 'SANJUAN-01' ORDER BY `km`
```

Rows: `[{"well_id": "SANJUAN-02", "well_name": "San Juan 02", "basin": "San Juan", "km": "7.4", "same_basin": "true"}]`

**Q: What is the net pay in the Westwater formation for GREENRIVER-03?** (COMPLETED, 18.6 s)

A: For well **GREENRIVER-03** in the **Green River** basin, net pay in the **Westwater** formation is **1,140.0 ft**. As added context from the same result, **GREENRIVER-03** has **0.95** net-to-gross, **0.1696** average pay porosity, **0.1835** average pay water saturation, and **157.879** hydrocarbon pore feet in **Westwater**.

```sql
SELECT `well_id`, `basin`, `formation_name`, `net_pay_ft`, `net_to_gross`, `avg_pay_phi`, `avg_pay_sw`, `hc_pore_ft`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`gold_zone_summary`
WHERE `role` = 'app_well'
  AND `well_id` = 'GREENRIVER-03'
  AND `formation_name` = 'Westwater'
```

Rows: `[{"well_id": "GREENRIVER-03", "basin": "Green River", "formation_name": "Westwater", "net_pay_ft": "1140.0", "net_to_gross": "0.95", "avg_pay_phi": "0.1696", "avg_pay_sw": "0.1835", "hc_pore_ft": "157.879"}]`

## 6. Unity Catalog policy (`06_uc_governance.json`)

Same query, same user (reishin.toolsi@databricks.com), before and after mapping them as a San Juan JV partner:

| View | Rows | Basins | Sw visible | HC pore ft visible |
|---|---|---|---|---|
| Operator | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |
| JV partner, San Juan | 30 | San Juan | 0 | 0 |
| Restored | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |

The same policy on the equipment and H2S data (row filter on `well_h2s_profile`, masks on `equipment_component_spec`, inherited by every view built on them). H2S concentration stays visible to partners on purpose: safety data is not masked.

| Object | View | Rows | Basins | H2S ppm visible | Upgrade capex visible | Risk score / notes visible |
|---|---|---|---|---|---|---|
| well_equipment_integrity (view) | Operator | 48 | East Texas,Green River,Permian Basin,San Juan | 48 | 48 | 48 |
| well_h2s_profile (table) | Operator | 6 | East Texas,Green River,Permian Basin,San Juan | 6 | n/a | 6 |
| well_equipment_integrity (view) | JV partner | 16 | San Juan | 16 | 0 | 0 |
| well_h2s_profile (table) | JV partner | 2 | San Juan | 2 | n/a | 0 |

## 7. Live app (`07_app_api.json`)

- `/api/sonic/GREENRIVER-03`: source **model** via `subsurface-synthetic-sonic`, 501 rows, no measured sonic on this well.
- `/api/voxels/stepout_value/SANJUAN-01`: priced by **uc_function**: step-out $103.37M unrisked, $40.32M risked, offset $92.75M.
- `/api/economics/summary`: priced by **uc_function**, portfolio $507.8M, WTI source `synthetic`.

## 8. Tests (`08_tests.txt`)

`pytest tests -v`: ============================== 31 passed in 0.37s ==============================

## 9. Workspace notebook run (`09_notebook_result.json`, `09_notebook_run.html`)

`notebooks/evidence_run.py` executed as a serverless job run (1025664438265546) in the FEVM workspace: champion model v2 MAE 3.003 vs calibrated Gardner 10.683 us/ft from MLflow; 10 live predictions, mean abs error 1.76 us/ft on measured sonic; Genie:

- **Which basin has the highest total live NPV?** The basin with the **highest** total live NPV is **San Juan**, with **155.92 million USD** in total live NPV. Based on the result shown, **San Juan** is the top-ranked basin on this measure.
- **Which wells are within 50 km of SANJUAN-01 and how far are they?** Within 50 km of **SANJUAN-01**, the only well shown is **SANJUAN-02** (**San Juan 02**) in the **San Juan** basin at **7.4 km** away, with **same_basin = true**. Based on the 1 row returned, **SANJUAN-02** is both the nearest and only listed nearby well in this result.
- **What is the net pay in the Westwater formation for GREENRIVER-03?** For well **GREENRIVER-03** in the **Westwater** formation, **net pay is 1,140.0 ft**. As context, **gross interval is 1,200.0 ft** and **net-to-gross is 0.95**, which indicates most of the Westwater interval is counted as pay in **GREENRIVER-03**.

The HTML export holds every cell with its output, including the governed query and the policy functions.

## 10. Drift check and automatic retrain (`10_drift_check.json`)

Job `subsurface-sonic-drift-check` scores the served model on every well with measured sonic against two bars: 1.5x its validated leave-one-well-out MAE, and calibrated Gardner on that well.

| Check | Wells | In drift | Action |
|---|---|---|---|
| 2026-10-22T15:02:18.945Z | 13 | none | none |
| 2026-10-22T15:03:31.489Z | 14 | NEW-SANJUAN-01-NPHI+0.12 | retrain triggered: subsurface-command-build run 753993907816317 (train_serve_score) |

Simulated new well `NEW-SANJUAN-01-NPHI+0.12` (an existing well with a +0.12 v/v neutron-tool calibration shift): model error 5.376 us/ft against a bar of 4.504 (Gardner 11.229), so it drifted and the retrain fired.

Triggered retrain: `subsurface-command-build` run 753993907816317, task train_serve_score SUCCESS, land_raw DISABLED, medallion DISABLED, policies DISABLED, 2026-10-22 15:03:35 UTC to 2026-10-22 15:16:55 UTC. Champion after: v3 (run b9412f716a8b4cf5bdbfa5ffccb21843).

## 11. Decision brief (`11_decision_brief.json`)

`POST /api/voxels/decision_brief/SANJUAN-01`, served by `databricks-claude-sonnet-4-5` through the AI Gateway routing chain, 686 prompt and 495 completion tokens. Validator: 24 figures checked, 0 not in the governed facts, facts cited F3, F6, F8, F9, F10. Logged to `oil_pump_monitor_catalog.subsurface_command.gold_action_plans` (4 briefs logged, 3 fully grounded).

> **Recommendation**
>
> Approve the step-out well 2,616 ft from SANJUAN-01 with $58M capex authorization [F1, F6].
>
> **Why this well**
>
> - Delivers $40.3M NPV10 at 34% IRR with 2.0 yr payback and $53 break-even WTI, well below current $79.18 strip [F5, F6].
> - Voxel model predicts 253.0 ft hydrocarbon pore thickness vs 238.6 ft at SANJUAN-01, risked to 167.5 ft for distance from control [F2, F3].
> - Synthetic-sonic model demonstrates 3.0 us/ft accuracy on held-out wells, significantly outperforming calibrated Gardner at 10.7 us/ft [F9].
>
> **Why now**
>
> - Six-month delay costs $1.9M (4.7% of risked NPV) due to discounting [F8].
> - Structural closure of 158 ft and 140 ft normal fault support hydrocarbon column with free-water level at 9275 ft [F10].
>
> **Risks and how they are controlled**
>
> - Subsurface uncertainty of 0.68 (moderate-high on 0-1 scale) reflects 2,616 ft distance from control; risked economics haircut pore thickness from 253.0 ft to 167.5 ft [F3, F2].
> - H2S risk is low at 1.2 ppm with no NACE MR0175 requirement and $0.00M sour-service upgrade [F11, F12].
>
> **Next actions**
>
> - **Asset team**: Finalize drilling AFE at $58M capex using offset well design [F6].
> - **VP of Engineering**: Confirm wellbore design incorporates 140 ft fault crossing and free-water level at 9275 ft [F10].
> - **SVP Digital Operations**: Commission post-drill voxel model calibration to reduce uncertainty for future step-outs [F3].

## 12. Engineer morning briefing (`12_engineer_briefing.json`)

The operations agent ran 6 governed rules (7 glossary terms in `business_glossary`) over UC data: **8 open action items on EASTTEXAS-05** (the 12,000 ppm extreme-sour well) and 4 on GREENRIVER-03, PERMIAN-04.

| Rule | Severity | Well | Evidence | Links |
|---|---|---|---|---|
| R-H2S-AUDIT | critical | EASTTEXAS-05 | Last audit 2025-10-01, 386 days ago (interval 365 days); 12000.0 ppm, safety status critical | catalog, app, ticket, genie |
| R-SAF-CRIT | critical | EASTTEXAS-05 | 12000.0 ppm, alarm at 10 ppm, PPE level-B, EEBA required true, continuous monitor true | dashboard, catalog, genie |
| R-EQ-LONGLEAD | high | EASTTEXAS-05 | 5 components at risk 90+ with 18+ week lead: Production tubulars / casing 18 wk; Wellhead & Christmas tree 22 wk; ESP pump & motor metallurgy 24 wk; Flowlines & gathering 20 wk; Valves & BOP stack 20 wk. Upgrade capex $12.60M | app, dashboard, ticket, genie |
| R-H2S-SAMPLE | high | EASTTEXAS-05 | Last measured 2025-11-14, 342 days ago (interval 180 days) at 12000.0 ppm | dashboard, ticket, genie |
| R-INV-COVER | high | EASTTEXAS-05 | P-002: 18 jt on hand at 2.50/day = 7.2 days of cover vs 35 day lead time (Tubular Supplier) | catalog, ticket, genie |
| R-INV-COVER | high | EASTTEXAS-05 | P-005: 5 kit on hand at 0.20/day = 25.0 days of cover vs 28 day lead time (Wellhead Supplier) | catalog, ticket, genie |
| R-INV-COVER | high | EASTTEXAS-05 | P-008: 1 ea on hand at 0.05/day = 20.0 days of cover vs 60 day lead time (Wellhead Supplier) | catalog, ticket, genie |
| R-ECON-SOURCAPEX | medium | EASTTEXAS-05 | $14.35M upgrade capex is 11.1% of the well live NPV10 of $129.9M | app, ticket, genie |
| R-H2S-AUDIT | critical | PERMIAN-04 | Last audit 2025-09-30, 387 days ago (interval 365 days); 44.0 ppm, safety status overdue | catalog, app, ticket, genie |
| R-H2S-SAMPLE | high | GREENRIVER-03 | Last measured 2025-12-03, 323 days ago (interval 180 days) at 32.5 ppm | dashboard, ticket, genie |
| R-H2S-SAMPLE | high | PERMIAN-04 | Last measured 2025-10-22, 365 days ago (interval 180 days) at 44.0 ppm | dashboard, ticket, genie |
| R-ECON-SOURCAPEX | medium | PERMIAN-04 | $3.37M upgrade capex is 12.3% of the well live NPV10 of $27.4M | app, ticket, genie |

Agent note by `databricks-claude-sonnet-4-5`, validator: 12 figures checked, 0 not in the items:

> The H2S safety audit is 386 days overdue and must be completed immediately given the critical 12000.0 ppm concentration requiring PPE level-B and EEBA [A1][A2]. The H2S re-sample is also overdue at 342 days past its 180 day interval [A4], and three sour-critical parts will stock out before their lead times: P-002 has only 7.2 days of cover versus 35 day lead time, P-005 has 25.0 days versus 28 days, and P-008 has 20.0 days versus 60 days [A5][A6][A7]. Additionally, 5 long-lead sour components with 18+ week lead times totaling $12.60M capex remain not on order [A3].

Governed threshold drives the briefing: with the glossary's H2S safety audit interval at 365 days there are 2 audit items (8 open on EASTTEXAS-05); raised to 400 days through the app, 0 (7 open); restored to 365, 2. No code changed.

Ticket round trip: `SUB-A5923F` created through the app, found in `engineer_tickets` as [{'ticket_id': 'SUB-A5923F', 'created_by': 'reishin.toolsi@databricks.com', 'rule_id': 'R-INV-COVER', 'well_id': 'EASTTEXAS-05', 'title': 'Reorder ticket: EASTTEXAS-05 13-3/8in casing joint', 'status': 'open'}], then deleted.

Genie explains the flag: **Why is EASTTEXAS-05 flagged by rule R-H2S-AUDIT (H2S safety audit)? Show the rule, its glossary definition and the data behind it.**

```sql
SELECT
  r.`rule_id`,
  r.`title`,
  r.`glossary_term`,
  g.`definition`,
  g.`threshold`,
  g.`threshold_value`,
  g.`owner`,
  g.`source`,
  h.`well_id`,
  h.`well_name`,
  h.`basin`,
  h.`h2s_risk_level`,
  h.`sour_classified`,
  h.`h2s_ppm_last_measured`,
  h.`h2s_measurement_date`,
  h.`last_safety_audit_date`,
  DATEDIFF(CURRENT_DATE(), h.`last_safety_audit_date`) AS `days_since_audit`,
  h.`safety_status`,
  h.`ppe_level`,
  h.`eeba_required`,
  h.`continuous_monitor_required`,
  h.`notes`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`engineer_rules` r
JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`business_glossary` g
  ON g.`term` = r.`glossary_term`
CROSS JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`well_h2s_profile` h
WHERE r.`rule_id` = 'R-H2S-AUDIT'
  AND h.`well_id` = 'EASTTEXAS-05'
```

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.  EASTTEXAS-05 is flagged by **R-H2S-AUDIT** because the rule **"H2S safety audit overdue"** uses the glossary term **"H2S safety audit interval"**, defined as **"Every sour well needs an on-site H2S safety audit (monitors, alarms, EEBA, contingency plan, training) at least once a year"** with a threshold of **365 days** from **Company H2S standard** owned by **HSE**. For EASTTEXAS-05, the supporting data shows **sour_classified = true**, **h2s_ppm_last_measured = 12000.0**, **last_safety_audit_date = 2025-10-01**, and **days_since_audit = 386**, which is **21 days over** the **365-day** limit. EASTTEXAS-05 also shows **h2s_risk_level = high** and **safety_status = critical**, which 
