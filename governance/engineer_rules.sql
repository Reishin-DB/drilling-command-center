-- Engineer morning briefing: the business context the operations agent works from.
--   business_glossary   governed terms and thresholds (what "sour", "audit interval", "days of cover" mean here)
--   engineer_rules      each rule is a read-only SELECT over governed UC tables, tied to a glossary term,
--                       an owner, a severity, and where the engineer goes to close it
--   engineer_tickets    tickets the engineer raises from an action item
--   engineer_action_log close-outs, so a closed item stays closed until the data changes
-- Apply: python governance/apply_sql.py governance/engineer_rules.sql (or the SQL editor), schema substituted.

CREATE TABLE IF NOT EXISTS ${schema}.business_glossary (
  term        STRING NOT NULL,
  definition  STRING,
  threshold   STRING,
  threshold_value DOUBLE COMMENT 'The number the rules read; change it here and the next briefing changes.',
  owner       STRING,
  source      STRING
) COMMENT 'Governed business glossary for subsurface operations: the meaning and thresholds behind every engineer action rule.';

CREATE TABLE IF NOT EXISTS ${schema}.engineer_rules (
  rule_id      STRING NOT NULL,
  title        STRING,
  glossary_term STRING,
  severity     STRING,
  owner_role   STRING,
  action       STRING,
  check_sql    STRING,
  links_json   STRING
) COMMENT 'Engineer action rules. check_sql is a read-only SELECT over governed tables returning well_id, subject, evidence, metric, threshold; each returned row is an action item.';

CREATE TABLE IF NOT EXISTS ${schema}.engineer_tickets (
  ticket_id   STRING NOT NULL,
  created_at  TIMESTAMP,
  created_by  STRING,
  item_key    STRING,
  rule_id     STRING,
  well_id     STRING,
  title       STRING,
  detail      STRING,
  status      STRING
) COMMENT 'Tickets raised by engineers from morning action items.';

CREATE TABLE IF NOT EXISTS ${schema}.engineer_action_log (
  item_key    STRING NOT NULL,
  status      STRING,
  at          TIMESTAMP,
  by          STRING,
  note        STRING
) COMMENT 'Close-outs of engineer action items.';

ALTER TABLE ${schema}.business_glossary ADD COLUMNS (threshold_value DOUBLE COMMENT 'The number the rules read; change it here and the next briefing changes.');

DELETE FROM ${schema}.business_glossary;
INSERT INTO ${schema}.business_glossary (term, definition, threshold, threshold_value, owner, source) VALUES
  ('Sour service', 'A well whose produced fluids contain enough H2S to cause sulfide stress cracking in standard steels. Here: H2S at or above 100 ppm, or classified sour by HSE.', 'H2S >= 100 ppm or sour_classified', 100, 'HSE', 'NACE MR0175 / ISO 15156'),
  ('Severity band', 'Sour-service band from the last measured H2S: sweet, low (10 ppm), moderate (100 ppm or classified sour), high (2,000 ppm), extreme (10,000 ppm). Drives equipment specification.', 'sweet / low / moderate / high / extreme', NULL, 'Engineering', 'v_well_sour_band'),
  ('H2S safety audit interval', 'Every sour well needs an on-site H2S safety audit (monitors, alarms, EEBA, contingency plan, training) at least once a year.', '365 days', 365, 'HSE', 'Company H2S standard'),
  ('H2S re-sample interval', 'H2S concentration in the production stream must be re-measured on sour wells at least every six months, because souring increases with time and water injection.', '180 days', 180, 'Production engineering', 'Company H2S standard'),
  ('Long-lead sour component', 'A sour-service component rated high risk (risk score 90 or more) whose upgrade takes 18 weeks or more to procure; it must be on order before the next intervention window.', 'risk_score >= 90 and lead >= 18 weeks', 18, 'Supply chain', 'well_equipment_integrity'),
  ('Days of cover', 'Stock on hand divided by daily burn. When days of cover is shorter than the supplier lead time, the part will stock out before a reorder arrives.', 'days of cover < lead time', NULL, 'Supply chain', 'drilling_inventory'),
  ('Sour capex materiality', 'Sour-service upgrade capex that is 10% or more of the well live NPV10 must be carried explicitly in the AFE.', '>= 10% of NPV10', 10, 'Finance', 'well_economics + well_equipment_integrity');

DELETE FROM ${schema}.engineer_rules;
INSERT INTO ${schema}.engineer_rules VALUES
  ('R-H2S-AUDIT', 'H2S safety audit overdue', 'H2S safety audit interval', 'critical', 'Production engineer',
   'Schedule the H2S safety audit and confirm monitors, alarm set points, EEBA and the contingency plan.',
   'SELECT well_id, \'H2S safety audit\' AS subject, concat(\'Last audit \', CAST(last_safety_audit_date AS STRING), \', \', CAST(datediff(current_date(), last_safety_audit_date) AS STRING), \' days ago (interval \', CAST(CAST((SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S safety audit interval\') AS INT) AS STRING), \' days); \', CAST(h2s_ppm_last_measured AS STRING), \' ppm, safety status \', safety_status) AS evidence, CAST(datediff(current_date(), last_safety_audit_date) AS DOUBLE) AS metric, (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S safety audit interval\') AS threshold FROM ${schema}.well_h2s_profile WHERE (sour_classified OR h2s_ppm_last_measured >= 100) AND datediff(current_date(), last_safety_audit_date) > (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S safety audit interval\')',
   '[{"label":"H2S profile in Catalog Explorer","kind":"catalog","target":"well_h2s_profile"},{"label":"Open the Equipment tab","kind":"app","target":"equipment"},{"label":"Create audit ticket","kind":"ticket"}]'),
  ('R-H2S-SAMPLE', 'H2S re-sample overdue', 'H2S re-sample interval', 'high', 'Production engineer',
   'Take a fresh H2S sample from the production stream and update the well profile.',
   'SELECT well_id, \'H2S concentration\' AS subject, concat(\'Last measured \', CAST(h2s_measurement_date AS STRING), \', \', CAST(datediff(current_date(), h2s_measurement_date) AS STRING), \' days ago (interval \', CAST(CAST((SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S re-sample interval\') AS INT) AS STRING), \' days) at \', CAST(h2s_ppm_last_measured AS STRING), \' ppm\') AS evidence, CAST(datediff(current_date(), h2s_measurement_date) AS DOUBLE) AS metric, (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S re-sample interval\') AS threshold FROM ${schema}.well_h2s_profile WHERE (sour_classified OR h2s_ppm_last_measured >= 100) AND datediff(current_date(), h2s_measurement_date) > (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'H2S re-sample interval\')',
   '[{"label":"Sour-service dashboard","kind":"dashboard"},{"label":"Create sampling ticket","kind":"ticket"}]'),
  ('R-SAF-CRIT', 'Critical H2S safety status', 'Sour service', 'critical', 'Production engineer',
   'Walk the H2S contingency plan with the site supervisor; confirm continuous monitoring, EEBA availability and Level-B PPE before any work on the well.',
   'SELECT well_id, \'Safety status\' AS subject, concat(CAST(h2s_ppm_last_measured AS STRING), \' ppm, alarm at \', CAST(h2s_monitor_alarm_ppm AS STRING), \' ppm, PPE \', ppe_level, \', EEBA required \', CAST(eeba_required AS STRING), \', continuous monitor \', CAST(continuous_monitor_required AS STRING)) AS evidence, CAST(h2s_ppm_last_measured AS DOUBLE) AS metric, CAST(h2s_monitor_alarm_ppm AS DOUBLE) AS threshold FROM ${schema}.well_h2s_profile WHERE safety_status = \'critical\'',
   '[{"label":"Sour-service dashboard","kind":"dashboard"},{"label":"H2S profile in Catalog Explorer","kind":"catalog","target":"well_h2s_profile"}]'),
  ('R-EQ-LONGLEAD', 'Long-lead sour components not on order', 'Long-lead sour component', 'high', 'Production engineer',
   'Raise procurement for every long-lead sour component so it lands before the next intervention window.',
   'SELECT well_id, \'Sour-service equipment\' AS subject, concat(CAST(count(*) AS STRING), \' components at risk 90+ with 18+ week lead: \', concat_ws(\'; \', collect_list(concat(component_name, \' \', CAST(upgrade_lead_weeks AS STRING), \' wk\'))), \'. Upgrade capex $\', CAST(round(sum(upgrade_capex_musd), 2) AS STRING), \'M\') AS evidence, CAST(max(upgrade_lead_weeks) AS DOUBLE) AS metric, (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'Long-lead sour component\') AS threshold FROM ${schema}.well_equipment_integrity WHERE risk_score >= 90 AND upgrade_lead_weeks >= (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'Long-lead sour component\') GROUP BY well_id',
   '[{"label":"Open the Equipment tab","kind":"app","target":"equipment"},{"label":"Sour-service dashboard","kind":"dashboard"},{"label":"Create procurement ticket","kind":"ticket"}]'),
  ('R-INV-COVER', 'Sour-critical parts will stock out', 'Days of cover', 'high', 'Production engineer',
   'Reorder now: these wellhead and tubular parts run out before a reorder can arrive.',
   'SELECT b.well_id, i.part_name AS subject, concat(i.part_id, \': \', CAST(i.on_hand_qty AS STRING), \' \', i.unit, \' on hand at \', CAST(i.daily_burn AS STRING), \'/day = \', CAST(round(i.on_hand_qty / i.daily_burn, 1) AS STRING), \' days of cover vs \', CAST(i.lead_time_days AS STRING), \' day lead time (\', i.supplier, \')\') AS evidence, round(i.on_hand_qty / i.daily_burn, 1) AS metric, CAST(i.lead_time_days AS DOUBLE) AS threshold FROM ${schema}.v_well_sour_band b CROSS JOIN ${schema}.drilling_inventory i WHERE b.severity_band IN (\'high\', \'extreme\') AND i.category IN (\'Wellhead\', \'Casing\') AND i.on_hand_qty / i.daily_burn < i.lead_time_days',
   '[{"label":"Inventory in Catalog Explorer","kind":"catalog","target":"drilling_inventory"},{"label":"Create reorder ticket","kind":"ticket"}]'),
  ('R-ECON-SOURCAPEX', 'Sour capex material to the AFE', 'Sour capex materiality', 'medium', 'Production engineer',
   'Carry the sour-service upgrade capex explicitly in the well AFE and flag it to finance.',
   'SELECT e.well_id, \'Sour-service capex\' AS subject, concat(\'$\', CAST(round(sum(q.upgrade_capex_musd), 2) AS STRING), \'M upgrade capex is \', CAST(round(100 * sum(q.upgrade_capex_musd) / max(e.npv10_live_musd), 1) AS STRING), \'% of the well live NPV10 of $\', CAST(round(max(e.npv10_live_musd), 1) AS STRING), \'M\') AS evidence, round(100 * sum(q.upgrade_capex_musd) / max(e.npv10_live_musd), 1) AS metric, (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'Sour capex materiality\') AS threshold FROM ${schema}.well_economics e JOIN ${schema}.well_equipment_integrity q ON q.well_id = e.well_id GROUP BY e.well_id HAVING 100 * sum(q.upgrade_capex_musd) / max(e.npv10_live_musd) >= (SELECT threshold_value FROM ${schema}.business_glossary WHERE term = \'Sour capex materiality\')',
   '[{"label":"Open Value the Well","kind":"app","target":"economics"},{"label":"Create AFE ticket","kind":"ticket"}]');


-- One page with the rules and the glossary behind each one: governance/engineer_rule_catalog.sql
