# Execution evidence

Captured from the live FEVM workspace on 2026-10-22 14:47 UTC by `scripts/collect_evidence.py`. Every number below comes from the JSON files in this folder, which hold the raw API responses.

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

The run was repaired in place: the first training attempts failed because the serverless training environment was missing numpy and scipy, and passed once they were added. Earlier runs of the job (FAILED, CANCELED) stopped on a semicolon inside a SQL comment that broke the statement splitter; that was fixed before this run.

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

`oil_pump_monitor_catalog.subsurface_command.synthetic_sonic` version **2** `@champion`, from run `synthetic-sonic` (11806608ec9f4301826a8a61d45cff3d), FINISHED, 2026-10-21 17:22:09 UTC.

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

Endpoint `subsurface-synthetic-sonic` **READY**, live call returned 8 predictions in 0.14 s. On SANJUAN-01 samples with measured sonic:

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

AI Gateway: usage tracking on, rate limit 600 calls/min, inference table `sonic_endpoint_payload`: 41 logged requests (41 HTTP 200) from 2026-10-21T17:32:54.403Z to 2026-10-22T14:19:23.440Z.

## 5. Genie conversation (`05_genie_conversation.json`)

**Q: Which basin has the highest total live NPV?** (COMPLETED, 18.0 s)

A: **San Juan** has the highest total live NPV at **155.92 million USD**. In the returned result set, **San Juan = 155.92 million USD** is the top basin based on wells with status **gold**, **qc_complete**, or **corrected**.

```sql
WITH basin_totals AS (
  SELECT
    `basin`,
    SUM(`npv10_live_musd`) AS `total_live_npv_musd`
  FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_economics`
  WHERE `status` IN ('gold', 'qc_complete', 'corrected')
    AND `basin` IS NOT NULL
  GROUP BY `basin`
), ranked AS (
  SELECT
    `basin`,
    `total_live_npv_musd`,
    RANK() OVER (ORDER BY `total_live_npv_musd` DESC) AS `rnk`
  FROM basin_totals
)
SELECT
  `basin`,
  `total_live_npv_musd`
FROM ranked
WHERE `rnk` <= 1
ORDER BY `total_live_npv_musd` DESC, `basin`
```

Rows: `[{"basin": "San Juan", "total_live_npv_musd": "155.92000000000002"}]`

**Q: Which wells are within 50 km of SANJUAN-01 and how far are they?** (COMPLETED, 19.1 s)

A: Within 50 km of **SANJUAN-01**, the only well shown is **SANJUAN-02** (**San Juan 02**) in the **San Juan** basin at **7.4 km** away, with **same_basin = true**. Based on the 1 returned result, **SANJUAN-02** is both the nearest and only nearby well in this result set.

```sql
SELECT `to_well` AS `well_id`, `to_name` AS `well_name`, `to_basin` AS `basin`, ROUND(`km`, 1) AS `km`, `same_basin`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_distances`
WHERE `from_well` = 'SANJUAN-01'
  AND `to_well` <> 'SANJUAN-01'
  AND `km` <= 50
ORDER BY `km`
```

Rows: `[{"well_id": "SANJUAN-02", "well_name": "San Juan 02", "basin": "San Juan", "km": "7.4", "same_basin": "true"}]`

**Q: What is the net pay in the Westwater formation for GREENRIVER-03?** (COMPLETED, 20.2 s)

A: For well ID **GREENRIVER-03** in the **Westwater** formation, **net pay is 1,140.0 ft**. As context, formation **Westwater** has **gross thickness 1,200.0 ft** and **net-to-gross 0.95**, which indicates most of the interval qualifies as pay.

```sql
SELECT
  `well_id`,
  `basin`,
  `formation_name`,
  `zone_index`,
  `zone_type`,
  `gross_ft`,
  `net_pay_ft`,
  `net_to_gross`,
  `avg_pay_phi`,
  `avg_pay_sw`,
  `hc_pore_ft`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`gold_zone_summary`
WHERE `well_id` = 'GREENRIVER-03'
  AND `role` = 'app_well'
  AND `formation_name` ILIKE '%Westwater%'
ORDER BY `zone_index`
```

Rows: `[{"well_id": "GREENRIVER-03", "basin": "Green River", "formation_name": "Westwater", "zone_index": "4", "zone_type": "reservoir", "gross_ft": "1200.0", "net_pay_ft": "1140.0", "net_to_gross": "0.95", "avg_pay_phi": "0.1696", "avg_pay_sw": "0.1835", "hc_pore_ft": "157.879"}]`

## 6. Unity Catalog policy (`06_uc_governance.json`)

Same query, same user (reishin.toolsi@databricks.com), before and after mapping them as a San Juan JV partner:

| View | Rows | Basins | Sw visible | HC pore ft visible |
|---|---|---|---|---|
| Operator | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |
| JV partner, San Juan | 30 | San Juan | 0 | 0 |
| Restored | 84 | East Texas, Green River, Permian Basin, San Juan | 48 | 84 |

## 7. Live app (`07_app_api.json`)

- `/api/sonic/GREENRIVER-03`: source **model** via `subsurface-synthetic-sonic`, 501 rows, no measured sonic on this well.
- `/api/voxels/stepout_value/SANJUAN-01`: priced by **uc_function**: step-out $103.37M unrisked, $40.32M risked, offset $92.75M.
- `/api/economics/summary`: priced by **uc_function**, portfolio $507.8M, WTI source `synthetic`.

## 8. Tests (`08_tests.txt`)

`pytest tests -v`: ============================== 24 passed in 0.34s ==============================

## 9. Workspace notebook run (`09_notebook_result.json`, `09_notebook_run.html`)

`notebooks/evidence_run.py` executed as a serverless job run (1025664438265546) in the FEVM workspace: champion model v2 MAE 3.003 vs calibrated Gardner 10.683 us/ft from MLflow; 10 live predictions, mean abs error 1.76 us/ft on measured sonic; Genie:

- **Which basin has the highest total live NPV?** The basin with the **highest** total live NPV is **San Juan**, with **155.92 million USD** in total live NPV. Based on the result shown, **San Juan** is the top-ranked basin on this measure.
- **Which wells are within 50 km of SANJUAN-01 and how far are they?** Within 50 km of **SANJUAN-01**, the only well shown is **SANJUAN-02** (**San Juan 02**) in the **San Juan** basin at **7.4 km** away, with **same_basin = true**. Based on the 1 row returned, **SANJUAN-02** is both the nearest and only listed nearby well in this result.
- **What is the net pay in the Westwater formation for GREENRIVER-03?** For well **GREENRIVER-03** in the **Westwater** formation, **net pay is 1,140.0 ft**. As context, **gross interval is 1,200.0 ft** and **net-to-gross is 0.95**, which indicates most of the Westwater interval is counted as pay in **GREENRIVER-03**.

The HTML export holds every cell with its output, including the governed query and the policy functions.
