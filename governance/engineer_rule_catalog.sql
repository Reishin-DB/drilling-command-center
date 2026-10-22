-- Rules with the governed glossary behind each one, on one Unity Catalog page.
-- Read by Catalog Explorer, Genie and the demo. Apply after engineer_rules.sql.

CREATE OR REPLACE VIEW subsurface_command.v_engineer_rule_catalog (
  rule_id COMMENT 'Rule shown on every action item',
  rule_title COMMENT 'What the rule flags',
  severity COMMENT 'critical, high or medium',
  rule_owner COMMENT 'Role that acts on it',
  action COMMENT 'What the engineer is asked to do',
  glossary_term COMMENT 'Governed business term the rule enforces',
  definition COMMENT 'What the term means at Landman Oil',
  threshold COMMENT 'Threshold in words',
  threshold_value COMMENT 'Live value the rule reads; change it in business_glossary and the next briefing changes',
  definition_owner COMMENT 'Function that owns the definition',
  source COMMENT 'Standard or table behind the definition',
  open_items_today COMMENT 'Action items the rule raises right now')
COMMENT 'Engineer action rules with the governed glossary behind each one: the rule, its business definition, owner, live threshold, and how many items it raises today. Read by the operations agent, the app and Genie.'
WITH SCHEMA COMPENSATION
AS SELECT r.rule_id, r.title, r.severity, r.owner_role, r.action, g.term, g.definition, g.threshold, g.threshold_value, g.owner, g.source, CASE r.rule_id WHEN 'R-H2S-AUDIT' THEN (SELECT count(*) FROM ${schema}.well_h2s_profile WHERE (sour_classified OR h2s_ppm_last_measured >= 100) AND datediff(current_date(), last_safety_audit_date) > g.threshold_value) WHEN 'R-H2S-SAMPLE' THEN (SELECT count(*) FROM ${schema}.well_h2s_profile WHERE (sour_classified OR h2s_ppm_last_measured >= 100) AND datediff(current_date(), h2s_measurement_date) > g.threshold_value) WHEN 'R-SAF-CRIT' THEN (SELECT count(*) FROM ${schema}.well_h2s_profile WHERE safety_status = 'critical') WHEN 'R-EQ-LONGLEAD' THEN (SELECT count(DISTINCT well_id) FROM ${schema}.well_equipment_integrity WHERE risk_score >= 90 AND upgrade_lead_weeks >= g.threshold_value) WHEN 'R-INV-COVER' THEN (SELECT count(*) FROM ${schema}.v_well_sour_band b CROSS JOIN ${schema}.drilling_inventory i WHERE b.severity_band IN ('high','extreme') AND i.category IN ('Wellhead','Casing') AND i.on_hand_qty / i.daily_burn < i.lead_time_days) WHEN 'R-ECON-SOURCAPEX' THEN (SELECT count(*) FROM (SELECT e.well_id FROM ${schema}.well_economics e JOIN ${schema}.well_equipment_integrity q ON q.well_id = e.well_id GROUP BY e.well_id HAVING 100 * sum(q.upgrade_capex_musd) / max(e.npv10_live_musd) >= g.threshold_value)) END FROM ${schema}.engineer_rules r JOIN ${schema}.business_glossary g ON g.term = r.glossary_term
;

ALTER VIEW ${schema}.v_engineer_rule_catalog SET TAGS ('domain' = 'operations');
