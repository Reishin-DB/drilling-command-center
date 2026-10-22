# H2S proof points: Genie and the governed glossary

Captured live from the FEVM workspace on 2026-10-22 21:54 UTC by `scripts/h2s_proof_points.py`. Genie space `01f17bdeaeee136fbd65013d3eb40261`; every answer, its generated SQL and its result rows are reproduced verbatim. 8 of 8 Genie questions completed.

## Part 1: Genie answers H2S and glossary questions

### Q1. Which wells are sour, and what is each one's H2S severity band and last measured ppm?

Status **COMPLETED** in 18.9 s (conversation `01f1ce6334921209a7adbc08f9138dce`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> The visible data shows **3 sour wells** with their H2S severity band and last measured ppm:
> - **EASTTEXAS-05** (East Texas 05): **extreme**, **12,000.0 ppm**
> - **PERMIAN-04** (Permian 04): **moderate**, **44.0 ppm**
> - **GREENRIVER-03** (Green River 03): **moderate**, **32.5 ppm**
>
> Based on these results, **EASTTEXAS-05** is the clear outlier with a much higher H2S reading than the other two sour wells.

**SQL Genie generated:**

```sql
SELECT `well_id`, `well_name`, `basin`, `severity_band`, `h2s_ppm` AS `last_measured_ppm` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`v_well_sour_band` WHERE `sour_classified` = TRUE AND `severity_band` IS NOT NULL AND `h2s_ppm` IS NOT NULL ORDER BY `h2s_ppm` DESC
```

**Rows returned:**

| well_id | well_name | basin | severity_band | last_measured_ppm |
|---|---|---|---|---|
| EASTTEXAS-05 | East Texas 05 | East Texas | extreme | 12000.0 |
| PERMIAN-04 | Permian 04 | Permian Basin | moderate | 44.0 |
| GREENRIVER-03 | Green River 03 | Green River | moderate | 32.5 |

### Q2. Why is EASTTEXAS-05 flagged for an H2S safety audit? Show the rule, its glossary definition and the data behind it.

Status **COMPLETED** in 25.8 s (conversation `01f1ce634010122d866f9074026b96f3`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> **EASTTEXAS-05** is flagged by rule **R-H2S-AUDIT** (**H2S safety audit overdue**) because glossary term **H2S safety audit interval** requires an audit at least once a year, with a threshold of **365 days**, and **EASTTEXAS-05** shows **386 days** since the last safety audit on **2025-10-01**. The glossary definition says every sour well needs an on-site H2S safety audit at least once a year, and the supporting well data shows **h2s_ppm_last_measured = 12000.0**, **safety_status = critical**, **ppe_level = level-B**, **eeba_required = true**, and **h2s_measurement_date = 2025-11-14** (**342 days** ago), with the rule owned by **HSE** and sourced from **Company H2S standard**.

**SQL Genie generated:**

```sql
SELECT r.`rule_id`, r.`title`, g.`term`, g.`definition`, g.`threshold`, g.`threshold_value`, g.`owner`, g.`source`, h.`well_id`, h.`well_name`, h.`basin`, h.`h2s_ppm_last_measured`, h.`last_safety_audit_date`, DATEDIFF(CURRENT_DATE(), h.`last_safety_audit_date`) AS `days_since_audit`, h.`h2s_measurement_date`, DATEDIFF(CURRENT_DATE(), h.`h2s_measurement_date`) AS `days_since_h2s_test`, h.`safety_status`, h.`ppe_level`, h.`eeba_required` FROM `oil_pump_monitor_catalog`.`subsurface_command`.`engineer_rules` r JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`business_glossary` g ON g.`term` = r.`glossary_term` CROSS JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`well_h2s_profile` h WHERE r.`rule_id` = 'R-H2S-AUDIT' AND h.`well_id` = 'EASTTEXAS-05'
```

**Rows returned:**

| rule_id | title | term | definition | threshold | threshold_value | owner | source | well_id | well_name | basin | h2s_ppm_last_measured | last_safety_audit_date | days_since_audit | h2s_measurement_date | days_since_h2s_test | safety_status | ppe_level | eeba_required |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-H2S-AUDIT | H2S safety audit overdue | H2S safety audit interval | Every sour well needs an on-site H2S safety audit (monitors, alarms, EEBA, contingency plan, training) at least once a y | 365 days | 365.0 | HSE | Company H2S standard | EASTTEXAS-05 | East Texas 05 | East Texas | 12000.0 | 2025-10-01 | 386 | 2025-11-14 | 342 | critical | level-B | true |

### Q3. What does the glossary say the H2S re-sample interval is, and which wells are overdue?

Status **COMPLETED** in 24.3 s (conversation `01f1ce634fb710d59c0f4b9a00de2d81`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> The glossary says the **H2S re-sample interval** is **180 days**: H2S in the production stream must be re-measured on sour wells at least every six months. The overdue wells are **PERMIAN-04** (**185 days overdue**), **EASTTEXAS-05** (**162 days overdue**), and **GREENRIVER-03** (**143 days overdue**). Among these 3 overdue wells, **EASTTEXAS-05** stands out as the most severe case with **12,000 ppm** and an **extreme** severity band.

**SQL Genie generated:**

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

**Rows returned:**

| rule_id | title | term | definition | threshold | threshold_value | owner | source | well_id | well_name | basin | severity_band | h2s_ppm_last_measured | h2s_measurement_date | days_since_h2s_test | days_overdue | ppe_level | eeba_required | safety_status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-H2S-SAMPLE | H2S re-sample overdue | H2S re-sample interval | H2S concentration in the production stream must be re-measured on sour wells at least every six months, because souring  | 180 days | 180.0 | Production engineering | Company H2S standard | PERMIAN-04 | Permian 04 | Permian Basin | moderate | 44.0 | 2025-10-22 | 365 | 185 | level-C | true | overdue |
| R-H2S-SAMPLE | H2S re-sample overdue | H2S re-sample interval | H2S concentration in the production stream must be re-measured on sour wells at least every six months, because souring  | 180 days | 180.0 | Production engineering | Company H2S standard | EASTTEXAS-05 | East Texas 05 | East Texas | extreme | 12000.0 | 2025-11-14 | 342 | 162 | level-B | true | critical |
| R-H2S-SAMPLE | H2S re-sample overdue | H2S re-sample interval | H2S concentration in the production stream must be re-measured on sour wells at least every six months, because souring  | 180 days | 180.0 | Production engineering | Company H2S standard | GREENRIVER-03 | Green River 03 | Green River | moderate | 32.5 | 2025-12-03 | 323 | 143 | level-C | false | overdue |

### Q4. What sour-service equipment does EASTTEXAS-05 need, and what is the longest lead time?

Status **COMPLETED** in 25.2 s (conversation `01f1ce635e71143e875bd0034de19fee`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> EASTTEXAS-05 has **8** required sour-service equipment upgrades, and the **longest lead time is 24 weeks** for **ESP pump & motor metallurgy** with a required spec of **Full Inconel / Hastelloy wetted path**. Examples include:
> - **ESP pump & motor metallurgy** — **24 weeks**
> - **Wellhead & Christmas tree** — **22 weeks**
> - **Flowlines & gathering** — **20 weeks**
> - **Valves & BOP stack** — **20 weeks**
> - **Production tubulars / casing** — **18 weeks**
> The lead times range from **6 to 24 weeks**, with the highest-risk items clustered among the longer-lead upgrades.

**SQL Genie generated:**

```sql
SELECT component_name, required_spec, degradation_mechanism, risk_score, upgrade_capex_musd, upgrade_lead_weeks
FROM oil_pump_monitor_catalog.subsurface_command.well_equipment_integrity
WHERE well_id = 'EASTTEXAS-05' AND upgrade_required = TRUE AND component_name IS NOT NULL AND upgrade_lead_weeks IS NOT NULL
ORDER BY upgrade_lead_weeks DESC, component_name ASC
```

**Rows returned:**

| component_name | required_spec | degradation_mechanism | risk_score | upgrade_capex_musd | upgrade_lead_weeks |
|---|---|---|---|---|---|
| ESP pump & motor metallurgy | Full Inconel / Hastelloy wetted path | SSC + HIC + erosion | 95 | 1.60 | 24 |
| Wellhead & Christmas tree | API 6A HH CRA-clad sour trim | SSC + HIC | 92 | 2.20 | 22 |
| Flowlines & gathering | Solid 2205 duplex line pipe | HIC + wt. loss | 94 | 2.80 | 20 |
| Valves & BOP stack | Full CRA sour BOP & valve suite | SSC + HIC | 91 | 2.40 | 20 |
| Production tubulars / casing | 25Cr super-duplex CRA | SSC + HIC + wt. loss | 96 | 3.60 | 18 |
| ESP elastomers & seal section | FFKM seal section | H2S + thermal | 93 | 0.55 | 13 |
| Packers & downhole elastomers / seals | FFKM / Aflas, ED + high-temp rated | ED + thermal | 90 | 0.75 | 12 |
| Corrosion inhibitor & monitoring | Continuous inhibitor + inline inspection | wt. loss | 80 | 0.45 | 6 |

### Q5. Which wellhead and casing parts will stock out before a reorder arrives?

Status **COMPLETED** in 18.5 s (conversation `01f1ce636db41268bc4ef6e9f8bdaceb`).

**Genie's answer:**

> **3 parts** in the **Wellhead** and **Casing** categories will run out before a reorder arrives based on current usage and lead times. The most urgent are **13-3/8in casing joint** with **7.2 days** of cover versus **35 days** lead time, **Wellhead spool** with **20.0 days** versus **60 days**, and **BOP ram seal kit** with **25.0 days** versus **28 days**; among these, the casing joint is the tightest shortage risk.

**SQL Genie generated:**

```sql
SELECT drilling_inventory.part_id, drilling_inventory.part_name, drilling_inventory.category, drilling_inventory.on_hand_qty, drilling_inventory.daily_burn, ROUND(try_divide(drilling_inventory.on_hand_qty,drilling_inventory.daily_burn), 1) AS days_of_cover, drilling_inventory.lead_time_days, drilling_inventory.supplier
FROM oil_pump_monitor_catalog.subsurface_command.drilling_inventory
WHERE drilling_inventory.category IN ('Wellhead', 'Casing')
  AND try_divide(drilling_inventory.on_hand_qty,drilling_inventory.daily_burn) < drilling_inventory.lead_time_days
ORDER BY days_of_cover
```

**Rows returned:**

| part_id | part_name | category | on_hand_qty | daily_burn | days_of_cover | lead_time_days | supplier |
|---|---|---|---|---|---|---|---|
| P-002 | 13-3/8in casing joint | Casing | 18 | 2.50 | 7.2 | 35 | Tubular Supplier |
| P-008 | Wellhead spool | Wellhead | 1 | 0.05 | 20.0 | 60 | Wellhead Supplier |
| P-005 | BOP ram seal kit | Wellhead | 5 | 0.20 | 25.0 | 28 | Wellhead Supplier |

### Q6. What do the engineer action rules mean, and who owns each threshold?

Status **COMPLETED** in 18.9 s (conversation `01f1ce6379311ffe8ee39dc0d34c7667`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> The engineer action rules in the catalog are all owned operationally by the **Production engineer**, while the threshold definitions are owned by **Finance**, **Supply chain**, **HSE**, or **Production engineering** depending on the rule. Examples include:
> - **R-ECON-SOURCAPEX** — threshold owner: **Finance**; trigger: **>= 10% of NPV10**
> - **R-EQ-LONGLEAD** — threshold owner: **Supply chain**; trigger: **risk score >= 90 and lead >= 18 weeks**
> - **R-H2S-AUDIT** — threshold owner: **HSE**; trigger: **365 days**
> - **R-H2S-SAMPLE** — threshold owner: **Production engineering**; trigger: **180 days**
> - **R-INV-COVER** — threshold owner: **Supply chain**; trigger: **days of cover < lead time**
>
> Across the 6 rules shown, **Production engineer** owns every rule, and **HSE** owns the two **critical** threshold definitions.

**SQL Genie generated:**

```sql
SELECT `rule_id`, `rule_title`, `severity`, `rule_owner`, `glossary_term`, `definition`, `threshold`, `threshold_value`, `definition_owner`, `source`, `action`, `open_items_today`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`v_engineer_rule_catalog`
WHERE `rule_id` IS NOT NULL
  AND `glossary_term` IS NOT NULL
ORDER BY `rule_id`
```

**Rows returned:**

| rule_id | rule_title | severity | rule_owner | glossary_term | definition | threshold | threshold_value | definition_owner | source | action | open_items_today |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R-ECON-SOURCAPEX | Sour capex material to the AFE | medium | Production engineer | Sour capex materiality | Sour-service upgrade capex that is 10% or more of the well live NPV10 must be carried explicitly in the AFE. | >= 10% of NPV10 | 10.0 | Finance | well_economics + well_equipment_integrity | Carry the sour-service upgrade capex explicitly in the well AFE and flag it to finance. | 2 |
| R-EQ-LONGLEAD | Long-lead sour components not on order | high | Production engineer | Long-lead sour component | A sour-service component rated high risk (risk score 90 or more) whose upgrade takes 18 weeks or more to procure; it mus | risk_score >= 90 and lead >= 18 weeks | 18.0 | Supply chain | well_equipment_integrity | Raise procurement for every long-lead sour component so it lands before the next intervention window. | 1 |
| R-H2S-AUDIT | H2S safety audit overdue | critical | Production engineer | H2S safety audit interval | Every sour well needs an on-site H2S safety audit (monitors, alarms, EEBA, contingency plan, training) at least once a y | 365 days | 365.0 | HSE | Company H2S standard | Schedule the H2S safety audit and confirm monitors, alarm set points, EEBA and the contingency plan. | 2 |
| R-H2S-SAMPLE | H2S re-sample overdue | high | Production engineer | H2S re-sample interval | H2S concentration in the production stream must be re-measured on sour wells at least every six months, because souring  | 180 days | 180.0 | Production engineering | Company H2S standard | Take a fresh H2S sample from the production stream and update the well profile. | 3 |
| R-INV-COVER | Sour-critical parts will stock out | high | Production engineer | Days of cover | Stock on hand divided by daily burn. When days of cover is shorter than the supplier lead time, the part will stock out  | days of cover < lead time |  | Supply chain | drilling_inventory | Reorder now: these wellhead and tubular parts run out before a reorder can arrive. | 3 |
| R-SAF-CRIT | Critical H2S safety status | critical | Production engineer | Sour service | A well whose produced fluids contain enough H2S to cause sulfide stress cracking in standard steels. Here: H2S at or abo | H2S >= 100 ppm or sour_classified | 100.0 | HSE | NACE MR0175 / ISO 15156 | Walk the H2S contingency plan with the site supervisor; confirm continuous monitoring, EEBA availability and Level-B PPE | 1 |

### Q7. How much sour-service upgrade capex does EASTTEXAS-05 carry relative to its live NPV?

Status **COMPLETED** in 24.4 s (conversation `01f1ce6384bf170f92e68de1c52df2a9`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> For well **EASTTEXAS-05** (East Texas 05) in **East Texas**, total sour-service upgrade capex is **14.35 MUSD** against live NPV of **129.85 MUSD**, which is **11.05%** of live NPV. This means well **EASTTEXAS-05** is carrying sour-service upgrade capex equal to about **0.111x** its live NPV.

**SQL Genie generated:**

```sql
SELECT
  e.`well_id`,
  e.`well_name`,
  e.`basin`,
  SUM(CASE WHEN i.`upgrade_required` = TRUE THEN CAST(i.`upgrade_capex_musd` AS DOUBLE) ELSE 0 END) AS `total_sour_upgrade_capex_musd`,
  e.`npv10_live_musd`,
  CASE
    WHEN e.`npv10_live_musd` IS NOT NULL AND e.`npv10_live_musd` <> 0
      THEN try_divide(SUM(CASE WHEN i.`upgrade_required` = TRUE THEN CAST(i.`upgrade_capex_musd` AS DOUBLE) ELSE 0 END),e.`npv10_live_musd`)
    ELSE NULL
  END AS `capex_to_npv_ratio`,
  CASE
    WHEN e.`npv10_live_musd` IS NOT NULL AND e.`npv10_live_musd` <> 0
      THEN try_divide(100 * SUM(CASE WHEN i.`upgrade_required` = TRUE THEN CAST(i.`upgrade_capex_musd` AS DOUBLE) ELSE 0 END),e.`npv10_live_musd`)
    ELSE NULL
  END AS `capex_to_npv_pct`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_economics` e
JOIN `oil_pump_monitor_catalog`.`subsurface_command`.`well_equipment_integrity` i
  ON e.`well_id` = i.`well_id`
WHERE e.`well_id` = 'EASTTEXAS-05'
  AND e.`status` IN ('gold', 'qc_complete', 'corrected')
GROUP BY e.`well_id`, e.`well_name`, e.`basin`, e.`npv10_live_musd`
```

**Rows returned:**

| well_id | well_name | basin | total_sour_upgrade_capex_musd | npv10_live_musd | capex_to_npv_ratio | capex_to_npv_pct |
|---|---|---|---|---|---|---|
| EASTTEXAS-05 | East Texas 05 | East Texas | 14.350000000000001 | 129.85 | 0.11051212938005392 | 11.051212938005394 |

### Q8. What PPE and monitoring does EASTTEXAS-05 require?

Status **COMPLETED** in 19.1 s (conversation `01f1ce6393951e4b8ef038c9509bdf6e`).

**Genie's answer:**

> ⚠️ H2S HAZARD: This formation has known or potential hydrogen sulfide (H2S) exposure risk. Verify the following before any site entry or well operations: (1) H2S gas monitors are calibrated and active, (2) Emergency Escape Breathing Apparatus (EEBA) is available and accessible to all personnel, (3) All personnel hold current H2S Alive or equivalent certification, (4) A muster point and escape plan are established. Do not rely on this data system for real-time safety decisions — contact your HSE officer.
>
> For well **EASTTEXAS-05**, the required protection and monitoring are **PPE level-B**, **continuous monitoring = true**, **EEBA required = true**, **H2S training required = true**, and **H2S monitor alarm = 10 ppm**. As added context for operations, well **EASTTEXAS-05** is **sour_classified = true**, has **h2s_ppm_last_measured = 12000.0**, and has **safety_status = critical**.

**SQL Genie generated:**

```sql
SELECT `well_id`, `well_name`, `basin`, `h2s_ppm_last_measured`, `h2s_risk_level`, `sour_classified`, `ppe_level`, `continuous_monitor_required`, `eeba_required`, `h2s_monitor_alarm_ppm`, `nace_mr0175_required`, `h2s_training_required`, `safety_status`, `last_safety_audit_date`, `h2s_measurement_date`
FROM `oil_pump_monitor_catalog`.`subsurface_command`.`well_h2s_profile`
WHERE `well_id` = 'EASTTEXAS-05'
```

**Rows returned:**

| well_id | well_name | basin | h2s_ppm_last_measured | h2s_risk_level | sour_classified | ppe_level | continuous_monitor_required | eeba_required | h2s_monitor_alarm_ppm | nace_mr0175_required | h2s_training_required | safety_status | last_safety_audit_date | h2s_measurement_date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EASTTEXAS-05 | East Texas 05 | East Texas | 12000.0 | high | true | level-B | true | true | 10 | true | true | critical | 2025-10-01 | 2025-11-14 |

## Part 2: The governed glossary, queried directly

### G1. The rule catalog: each rule with its glossary definition, owner, live threshold and open items today

```sql
SELECT rule_id, rule_title, glossary_term, threshold_value, definition_owner, open_items_today FROM oil_pump_monitor_catalog.subsurface_command.v_engineer_rule_catalog ORDER BY rule_id
```

| rule_id | rule_title | glossary_term | threshold_value | definition_owner | open_items_today |
|---|---|---|---|---|---|
| R-ECON-SOURCAPEX | Sour capex material to the AFE | Sour capex materiality | 10.0 | Finance | 2 |
| R-EQ-LONGLEAD | Long-lead sour components not on order | Long-lead sour component | 18.0 | Supply chain | 1 |
| R-H2S-AUDIT | H2S safety audit overdue | H2S safety audit interval | 365.0 | HSE | 2 |
| R-H2S-SAMPLE | H2S re-sample overdue | H2S re-sample interval | 180.0 | Production engineering | 3 |
| R-INV-COVER | Sour-critical parts will stock out | Days of cover |  | Supply chain | 3 |
| R-SAF-CRIT | Critical H2S safety status | Sour service | 100.0 | HSE | 1 |

### G2. Glossary terms attached to the columns they govern (Unity Catalog column tags)

```sql
SELECT g.term, g.owner, g.threshold, concat_ws(', ', collect_list(concat(t.table_name, '.', t.column_name))) AS governs
         FROM oil_pump_monitor_catalog.subsurface_command.business_glossary g JOIN oil_pump_monitor_catalog.information_schema.column_tags t
           ON t.tag_name = 'glossary_term' AND t.tag_value = g.term AND t.schema_name = 'subsurface_command'
         GROUP BY g.term, g.owner, g.threshold ORDER BY g.term
```

| term | owner | threshold | governs |
|---|---|---|---|
| Days of cover | Supply chain | days of cover < lead time | drilling_inventory.on_hand_qty, drilling_inventory.lead_time_days |
| H2S re-sample interval | Production engineering | 180 days | well_h2s_profile.h2s_measurement_date |
| H2S safety audit interval | HSE | 365 days | well_h2s_profile.last_safety_audit_date |
| Long-lead sour component | Supply chain | risk_score >= 90 and lead >= 18 weeks | equipment_component_spec.lead_weeks |
| Severity band | Engineering | sweet / low / moderate / high / extreme | equipment_component_spec.band |
| Sour capex materiality | Finance | >= 10% of NPV10 | well_economics.npv10_live_musd |
| Sour service | HSE | H2S >= 100 ppm or sour_classified | well_h2s_profile.sour_classified, well_h2s_profile.h2s_ppm_last_measured |

### G3. The H2S safety audit rule evaluated live, reading its threshold from the glossary

```sql
SELECT h.well_id, h.h2s_ppm_last_measured, h.last_safety_audit_date,
                datediff(current_date(), h.last_safety_audit_date) AS days_since_audit,
                g.threshold_value AS glossary_interval_days, g.owner AS threshold_owner,
                datediff(current_date(), h.last_safety_audit_date) > g.threshold_value AS overdue
         FROM oil_pump_monitor_catalog.subsurface_command.well_h2s_profile h CROSS JOIN oil_pump_monitor_catalog.subsurface_command.business_glossary g
         WHERE g.term = 'H2S safety audit interval' AND (h.sour_classified OR h.h2s_ppm_last_measured >= 100)
         ORDER BY days_since_audit DESC
```

| well_id | h2s_ppm_last_measured | last_safety_audit_date | days_since_audit | glossary_interval_days | threshold_owner | overdue |
|---|---|---|---|---|---|---|
| PERMIAN-04 | 44.0 | 2025-09-30 | 387 | 365.0 | HSE | true |
| EASTTEXAS-05 | 12000.0 | 2025-10-01 | 386 | 365.0 | HSE | true |
| GREENRIVER-03 | 32.5 | 2025-11-15 | 341 | 365.0 | HSE | false |

### G4. Relationships declared in Unity Catalog for the glossary layer (primary and foreign keys)

```sql
SELECT tc.table_name AS from_table, tc.constraint_name, ccu.table_name AS to_table
         FROM oil_pump_monitor_catalog.information_schema.referential_constraints rc
         JOIN oil_pump_monitor_catalog.information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
         JOIN oil_pump_monitor_catalog.information_schema.constraint_table_usage ccu ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
         WHERE tc.table_schema = 'subsurface_command' AND tc.table_name IN ('engineer_rules', 'engineer_tickets', 'well_h2s_profile') ORDER BY 1
```

| from_table | constraint_name | to_table |
|---|---|---|
| engineer_rules | rules_glossary_fk | business_glossary |
| engineer_tickets | tickets_rule_fk | engineer_rules |
| engineer_tickets | tickets_well_fk | operator_wells |
| well_h2s_profile | h2s_well_fk | operator_wells |

### G5. Sour-service equipment for the extreme-sour well, from the governed equipment view

```sql
SELECT component_name, required_spec, degradation_mechanism, risk_score, upgrade_capex_musd, upgrade_lead_weeks
         FROM oil_pump_monitor_catalog.subsurface_command.well_equipment_integrity WHERE well_id = 'EASTTEXAS-05' ORDER BY upgrade_lead_weeks DESC
```

| component_name | required_spec | degradation_mechanism | risk_score | upgrade_capex_musd | upgrade_lead_weeks |
|---|---|---|---|---|---|
| ESP pump & motor metallurgy | Full Inconel / Hastelloy wetted path | SSC + HIC + erosion | 95 | 1.60 | 24 |
| Wellhead & Christmas tree | API 6A HH CRA-clad sour trim | SSC + HIC | 92 | 2.20 | 22 |
| Flowlines & gathering | Solid 2205 duplex line pipe | HIC + wt. loss | 94 | 2.80 | 20 |
| Valves & BOP stack | Full CRA sour BOP & valve suite | SSC + HIC | 91 | 2.40 | 20 |
| Production tubulars / casing | 25Cr super-duplex CRA | SSC + HIC + wt. loss | 96 | 3.60 | 18 |
| ESP elastomers & seal section | FFKM seal section | H2S + thermal | 93 | 0.55 | 13 |
| Packers & downhole elastomers / seals | FFKM / Aflas, ED + high-temp rated | ED + thermal | 90 | 0.75 | 12 |
| Corrosion inhibitor & monitoring | Continuous inhibitor + inline inspection | wt. loss | 80 | 0.45 | 6 |
