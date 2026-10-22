-- Unity Catalog policies for Subsurface Command.
-- Personas live in a mapping table, so access follows the signed-in identity
-- everywhere (app, Genie, SQL editor, notebooks), not just inside the app.
--   jv_partner: a joint-venture partner. Sees only the basins it is party to
--               (one row per allowed basin), and sees net pay but not the
--               operator's interpreted saturation or hydrocarbon pore volume.
-- Created by the build job before the pipeline runs: the pipeline declares the
-- row filter and column masks on gold_zone_summary, and ml/train_synthetic_sonic.py
-- applies the row filter to gold_synthetic_sonic.

CREATE TABLE IF NOT EXISTS ${schema}.access_personas (
  principal     STRING NOT NULL COMMENT 'current_user() value: user email or service principal application id',
  persona       STRING NOT NULL COMMENT 'jv_partner is restricted, anyone not listed gets the operator view',
  allowed_basin STRING COMMENT 'basin a jv_partner may see, one row per basin',
  note          STRING
) COMMENT 'Persona mapping read by the row filters and column masks on the gold tables.';

CREATE OR REPLACE FUNCTION ${schema}.is_jv_partner()
  RETURNS BOOLEAN
  COMMENT 'True when the caller is mapped to the jv_partner persona.'
  RETURN EXISTS (SELECT 1 FROM ${schema}.access_personas
                 WHERE principal = current_user() AND persona = 'jv_partner');

CREATE OR REPLACE FUNCTION ${schema}.basin_filter(basin STRING)
  RETURNS BOOLEAN
  COMMENT 'Row filter: JV partners only see the basins they are party to.'
  RETURN NOT ${schema}.is_jv_partner()
      OR EXISTS (SELECT 1 FROM ${schema}.access_personas p
                 WHERE p.principal = current_user() AND p.persona = 'jv_partner' AND p.allowed_basin = basin);

CREATE OR REPLACE FUNCTION ${schema}.mask_interpretation(v DOUBLE)
  RETURNS DOUBLE
  COMMENT 'Column mask: hides operator-interpreted saturation and hydrocarbon volume from JV partners.'
  RETURN CASE WHEN ${schema}.is_jv_partner() THEN NULL ELSE v END;

-- Equipment and H2S: the same JV-partner policy, applied to the base tables so
-- every view built on them (v_well_sour_band, well_equipment_integrity, the
-- equipment metric view) inherits it for the querying user. H2S concentration,
-- alarm levels and PPE stay visible: safety data is never masked from people
-- who may be on location. What is masked is the operator's commercial and
-- interpretive content: component upgrade capex, risk scoring, and free-text notes.

CREATE OR REPLACE FUNCTION ${schema}.mask_commercial_dec32(v DECIMAL(3,2))
  RETURNS DECIMAL(3,2)
  COMMENT 'Column mask: hides operator upgrade capex from JV partners.'
  RETURN CASE WHEN ${schema}.is_jv_partner() THEN NULL ELSE v END;

CREATE OR REPLACE FUNCTION ${schema}.mask_interpretation_int(v INT)
  RETURNS INT
  COMMENT 'Column mask: hides operator risk scoring from JV partners.'
  RETURN CASE WHEN ${schema}.is_jv_partner() THEN NULL ELSE v END;

CREATE OR REPLACE FUNCTION ${schema}.mask_interpretation_str(v STRING)
  RETURNS STRING
  COMMENT 'Column mask: hides operator free-text interpretation from JV partners.'
  RETURN CASE WHEN ${schema}.is_jv_partner() THEN NULL ELSE v END;

ALTER TABLE ${schema}.well_h2s_profile SET ROW FILTER ${schema}.basin_filter ON (basin);
ALTER TABLE ${schema}.well_h2s_profile ALTER COLUMN notes SET MASK ${schema}.mask_interpretation_str;
ALTER TABLE ${schema}.equipment_component_spec ALTER COLUMN capex_musd SET MASK ${schema}.mask_commercial_dec32;
ALTER TABLE ${schema}.equipment_component_spec ALTER COLUMN risk_score SET MASK ${schema}.mask_interpretation_int;
