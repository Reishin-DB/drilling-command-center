# Execution evidence

Captured from the live FEVM workspace on 2026-10-22 21:50 UTC by `scripts/collect_evidence.py`. Every number below comes from the JSON files in this folder, which hold the raw API responses.

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

The run was repaired in place: the first training attempts failed because the serverless training environment was missing numpy and scipy, and passed once they were added. Earlier runs of the job (SUCCESS, SUCCESS, FAILED, CANCELED) stopped on a semicolon inside a SQL comment that broke the statement splitter; that was fixed before this run.

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

`oil_pump_monitor_catalog.subsurface_command.synthetic_sonic` version **4** `@champion`, from run `synthetic-sonic` (9d1636cb86c147d28909b8cd5576883d), FINISHED, 2026-10-22 18:56:36 UTC.

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

Endpoint `subsurface-synthetic-sonic` **READY**, live call returned 8 predictions in 100.501 s. On SANJUAN-01 samples with measured sonic:

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

AI Gateway: usage tracking on, rate limit 600 calls/min, inference table `sonic_endpoint_payload`: 282 logged requests (282 HTTP 200) from 2026-10-21T17:32:54.403Z to 2026-10-22T19:04:25.275Z.

## 5. Genie conversation (`05_genie_conversation.json`)

**Q: Which basin has the highest total live NPV?** (COMPLETED, 19.2 s)

A: The basin with the highest total live NPV is **San Juan**, with total live NPV of **155.92 million USD**. Based on the ranked result shown, **San Juan** is the top basin on this measure.

```sql
WITH basin_totals AS (
  SELECT
    well_economics.basin,
    SUM(well_economics.npv10_live_musd) AS total_live_npv_musd
  FROM oil_pump_monitor_catalog.subsurface_command.well_economics
  WHERE well_economics.status IN ('gold', 'qc_complete', 'corrected')
    AND well_economics.basin IS NOT NULL
    AND well_economics.npv10_live_musd IS NOT NULL
  GROUP BY well_economics.basin
), ranked_basins AS (
  SELECT
    basin,
    total_live_npv_musd,
    RANK() OVER (ORDER BY total_live_npv_musd DESC) AS rnk
  FROM basin_totals
)
SELECT
  basin,
  total_live_npv_musd
FROM ranked_basins
WHERE rnk = 1
ORDER BY basin
```

Rows: `[{"basin": "San Juan", "total_live_npv_musd": "155.92000000000002"}]`

**Q: Which wells are within 50 km of SANJUAN-01 and how far are they?** (COMPLETED, 17.9 s)

A: Within 50 km of **SANJUAN-01**, the only well shown is **SANJUAN-02** in the **San Juan** basin at **7.4 km** away, with **same_basin = true**. Based on the 1 row returned, **SANJUAN-02** is the nearest well listed within the 50 km range.

```sql
SELECT `to_well` AS `well_id`, `to_name` AS `well_name`, `to_basin` AS `basin`, ROUND(`km`, 1) AS `km`, `same_basin` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_distances` WHERE `from_well` = 'SANJUAN-01' AND `km` <= 50 AND `to_well` <> 'SANJUAN-01' ORDER BY `km`
```

Rows: `[{"well_id": "SANJUAN-02", "well_name": "San Juan 02", "basin": "San Juan", "km": "7.4", "same_basin": "true"}]`

**Q: What is the net pay in the Westwater formation for GREENRIVER-03?** (COMPLETED, 19.2 s)

A: For well ID **GREENRIVER-03** in the **Westwater** formation, the **net pay is 1,140.0 ft**. As context, well ID **GREENRIVER-03** has **1,200.0 ft** gross interval and a **0.95** net-to-gross ratio in the **Green River** basin.

```sql
SELECT
  `well_id`,
  `basin`,
  `formation_name`,
  `net_pay_ft`,
  `gross_ft`,
  `net_to_gross`,
  `avg_pay_phi`,
  `avg_pay_sw`,
  `hc_pore_ft`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`gold_zone_summary`
WHERE `role` = 'app_well'
  AND `well_id` = 'GREENRIVER-03'
  AND `formation_name` = 'Westwater'
  AND `formation_name` IS NOT NULL
  AND `net_pay_ft` IS NOT NULL
```

Rows: `[{"well_id": "GREENRIVER-03", "basin": "Green River", "formation_name": "Westwater", "net_pay_ft": "1140.0", "gross_ft": "1200.0", "net_to_gross": "0.95", "avg_pay_phi": "0.1696", "avg_pay_sw": "0.1835", "hc_pore_ft": "157.879"}]`

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

`pytest tests -v`: ============================== 31 passed in 0.45s ==============================

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
| 2026-10-22T18:55:22.347Z | 14 | NEW-PERMIAN-06-GRx1.3 | retrain triggered: subsurface-command-build run 730433284449926 (train_serve_score) |

Simulated new well `NEW-PERMIAN-06-GRx1.3` (an existing well with a +0.12 v/v neutron-tool calibration shift): model error 4.563 us/ft against a bar of 4.504 (Gardner 10.356), so it drifted and the retrain fired.

Triggered retrain: `subsurface-command-build` run 753993907816317, task train_serve_score SUCCESS, land_raw DISABLED, medallion DISABLED, policies DISABLED, 2026-10-22 15:03:35 UTC to 2026-10-22 15:16:55 UTC. Champion after: v4 (run 9d1636cb86c147d28909b8cd5576883d).

## 11. Decision brief (`11_decision_brief.json`)

`POST /api/voxels/decision_brief/SANJUAN-01`, served by `databricks-claude-sonnet-4-5` through the AI Gateway routing chain, 1945 prompt and 939 completion tokens. Validator: 23 figures checked, 0 not in the governed facts, facts cited F2, F8, F9, F10. Logged to `oil_pump_monitor_catalog.subsurface_command.gold_action_plans` (21 briefs logged, 20 fully grounded).

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

Agent note by `databricks-claude-sonnet-4-5`, validator: 13 figures checked, 0 not in the items:

> The H2S safety audit is 386 days overdue with the well at 12000.0 ppm requiring PPE level-B and EEBA [A1][A2], and the H2S re-sample is 342 days overdue [A4], making safety compliance the immediate priority. Three sour-critical parts face imminent stockouts: P-002 has only 7.2 days of cover against 35 day lead time, P-005 has 25.0 days versus 28 day lead, and P-008 has 20.0 days versus 60 day lead [A5][A6][A7]. Five long-lead sour components totaling $12.60M remain unordered despite 18+ week delivery times, including Production tubulars / casing at 18 wk, Wellhead & Christmas tree at 22 wk, and ESP pump & motor metallurgy at 24 wk [A3].

Governed threshold drives the briefing: with the glossary's H2S safety audit interval at 365 days there are 2 audit items (8 open on EASTTEXAS-05); raised to 400 days through the app, 0 (7 open); restored to 365, 2. No code changed.

Ticket round trip: `SUB-57FDED` created through the app, found in `engineer_tickets` as [{'ticket_id': 'SUB-57FDED', 'created_by': 'reishin.toolsi@databricks.com', 'rule_id': 'R-INV-COVER', 'well_id': 'EASTTEXAS-05', 'title': 'Reorder ticket: EASTTEXAS-05 13-3/8in casing joint', 'status': 'open'}], then deleted.

Genie explains the flag: **Why is EASTTEXAS-05 flagged by rule R-H2S-AUDIT (H2S safety audit)? Show the rule, its glossary definition and the data behind it.**

```sql
SELECT r.rule_id, r.title, r.severity, r.owner_role, r.action, g.term, g.definition, g.threshold, g.threshold_value, g.owner AS definition_owner, g.source, h.well_id, h.well_name, h.basin, h.primary_reservoir, h.h2s_risk_level, h.sour_classified, h.h2s_ppm_last_measured, h.h2s_measurement_date, h.last_safety_audit_date, DATEDIFF(current_date(), h.last_safety_audit_date) AS days_since_audit, h.ppe_level, h.eeba_required, h.nace_mr0175_required, h.safety_status
FROM oil_pump_monitor_catalog.subsurface_command.engineer_rules r
JOIN oil_pump_monitor_catalog.subsurface_command.business_glossary g ON g.term = r.glossary_term
JOIN oil_pump_monitor_catalog.subsurface_command.well_h2s_profile h ON h.well_id = 'EASTTEXAS-05'
WHERE r.rule_id = 'R-H2S-AUDIT'
```

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.  EASTTEXAS-05 is flagged by **R-H2S-AUDIT** because the rule is **"H2S safety audit overdue"** and the glossary definition says **"Every sour well needs an on-site H2S safety audit ... at least once a year"** with a threshold of **365 days** from the **Company H2S standard**; EASTTEXAS-05 is a sour well with **sour_classified = true** and **h2s_ppm_last_measured = 12000.0**. The supporting data shows **last_safety_audit_date = 2025-10-01**, **days_since_audit = 386**, **well_name = East Texas 05**, **primary_reservoir = Haynesville shale**, and the current **safety_status = critical**, which is consistent with the overdue audit.

## 13. Ontology in Unity Catalog (`13_ontology.json`)

Glossary terms tagged on the columns they govern (`information_schema.column_tags`, tag `glossary_term`):

| Glossary term | Governs |
|---|---|
| Days of cover | drilling_inventory.on_hand_qty, drilling_inventory.lead_time_days |
| H2S re-sample interval | well_h2s_profile.h2s_measurement_date |
| H2S safety audit interval | well_h2s_profile.last_safety_audit_date |
| Long-lead sour component | equipment_component_spec.lead_weeks |
| Severity band | equipment_component_spec.band |
| Sour capex materiality | well_economics.npv10_live_musd |
| Sour service | well_h2s_profile.sour_classified, well_h2s_profile.h2s_ppm_last_measured |

Declared relationships (`information_schema.referential_constraints`), with `operator_wells` as the hub:

| From | Constraint | To |
|---|---|---|
| engineer_rules | rules_glossary_fk | business_glossary |
| engineer_tickets | tickets_rule_fk | engineer_rules |
| engineer_tickets | tickets_well_fk | operator_wells |
| well_distances | dist_to_fk | operator_wells |
| well_distances | dist_from_fk | operator_wells |
| well_economics | econ_well_fk | operator_wells |
| well_h2s_profile | h2s_well_fk | operator_wells |

`v_engineer_rule_catalog`: each rule with its glossary term, live threshold, owner and open items today:

| Rule | Glossary term | Threshold | Owner | Open items |
|---|---|---|---|---|
| R-ECON-SOURCAPEX | Sour capex materiality | 10.0 | Finance | 2 |
| R-EQ-LONGLEAD | Long-lead sour component | 18.0 | Supply chain | 1 |
| R-H2S-AUDIT | H2S safety audit interval | 365.0 | HSE | 2 |
| R-H2S-SAMPLE | H2S re-sample interval | 180.0 | Production engineering | 3 |
| R-INV-COVER | Days of cover | None | Supply chain | 3 |
| R-SAF-CRIT | Sour service | 100.0 | HSE | 1 |
