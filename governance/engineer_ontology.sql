-- Ontology wiring for the engineer layer: declared relationships and column-level glossary terms.
-- The glossary, rules and tickets join the same PK/FK graph as operator_wells (the hub), and each
-- glossary term is tagged onto the columns it defines, so Catalog Explorer, Genie and lineage all
-- show which business term governs which data. Apply after engineer_rules.sql.

ALTER TABLE ${schema}.business_glossary ADD CONSTRAINT glossary_pk PRIMARY KEY (term) RELY;
ALTER TABLE ${schema}.engineer_rules ALTER COLUMN glossary_term SET NOT NULL;
ALTER TABLE ${schema}.engineer_rules ADD CONSTRAINT rules_pk PRIMARY KEY (rule_id) RELY;
ALTER TABLE ${schema}.engineer_rules ADD CONSTRAINT rules_glossary_fk FOREIGN KEY (glossary_term) REFERENCES ${schema}.business_glossary (term) RELY;
ALTER TABLE ${schema}.engineer_tickets ADD CONSTRAINT tickets_pk PRIMARY KEY (ticket_id) RELY;
ALTER TABLE ${schema}.engineer_tickets ADD CONSTRAINT tickets_rule_fk FOREIGN KEY (rule_id) REFERENCES ${schema}.engineer_rules (rule_id) RELY;
ALTER TABLE ${schema}.engineer_tickets ADD CONSTRAINT tickets_well_fk FOREIGN KEY (well_id) REFERENCES ${schema}.operator_wells (well_id) RELY;
ALTER TABLE ${schema}.drilling_inventory ALTER COLUMN part_id SET NOT NULL;
ALTER TABLE ${schema}.drilling_inventory ADD CONSTRAINT inventory_pk PRIMARY KEY (part_id) RELY;

ALTER TABLE ${schema}.well_h2s_profile ALTER COLUMN last_safety_audit_date SET TAGS ('glossary_term' = 'H2S safety audit interval');
ALTER TABLE ${schema}.well_h2s_profile ALTER COLUMN h2s_measurement_date SET TAGS ('glossary_term' = 'H2S re-sample interval');
ALTER TABLE ${schema}.well_h2s_profile ALTER COLUMN h2s_ppm_last_measured SET TAGS ('glossary_term' = 'Sour service');
ALTER TABLE ${schema}.well_h2s_profile ALTER COLUMN sour_classified SET TAGS ('glossary_term' = 'Sour service');
ALTER TABLE ${schema}.equipment_component_spec ALTER COLUMN lead_weeks SET TAGS ('glossary_term' = 'Long-lead sour component');
ALTER TABLE ${schema}.equipment_component_spec ALTER COLUMN band SET TAGS ('glossary_term' = 'Severity band');
ALTER TABLE ${schema}.drilling_inventory ALTER COLUMN on_hand_qty SET TAGS ('glossary_term' = 'Days of cover');
ALTER TABLE ${schema}.drilling_inventory ALTER COLUMN lead_time_days SET TAGS ('glossary_term' = 'Days of cover');
ALTER TABLE ${schema}.well_economics ALTER COLUMN npv10_live_musd SET TAGS ('glossary_term' = 'Sour capex materiality');
