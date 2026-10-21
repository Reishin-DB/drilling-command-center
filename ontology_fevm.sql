-- ============================================================================
-- Genie Ontology: Subsurface Command (FEVM)
-- Target: oil_pump_monitor_catalog.subsurface_command
-- Built against the ACTUAL deployed columns (verified 2026-07-27).
-- Warehouse 87e069097741b56c. Idempotent / safe to re-run.
-- Completes the 5-part ontology: descriptions, PK/FK graph, metric views,
-- certified functions, (Genie instructions live in the Space).
-- ============================================================================
USE CATALOG oil_pump_monitor_catalog;
USE SCHEMA  subsurface_command;

-- ----------------------------------------------------------------------------
-- 1. Descriptions (vocabulary layer) — finish column comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE operator_wells IS
  'Denormalized hub of operator wells: identity (well_id, well_name), location (basin, state, lat, lon), well_type, and total depth. One row per well. Join well_economics and well_h2s_profile on well_id.';

COMMENT ON COLUMN operator_wells.well_id IS 'Unique well identifier (primary key).';
COMMENT ON COLUMN operator_wells.well_name IS 'Human-readable well name.';
COMMENT ON COLUMN operator_wells.well_type IS 'Well trajectory: vertical, deviated, or horizontal.';
COMMENT ON COLUMN operator_wells.state IS 'US state where the well is located.';
COMMENT ON COLUMN operator_wells.total_depth_ft IS 'Total measured depth of the well, in feet.';

COMMENT ON COLUMN well_economics.well_id IS 'Well identifier. Foreign key to operator_wells.well_id.';
COMMENT ON COLUMN well_economics.status IS 'Data-quality status: gold (best), qc_complete, corrected, or raw. Filter to gold/qc_complete/corrected for trusted answers.';
COMMENT ON COLUMN well_economics.quality_score IS 'Data confidence score 0-100. Data quality only, NOT production or economic performance.';
COMMENT ON COLUMN well_economics.capex_musd IS 'Capital expenditure to drill and complete, millions USD.';
COMMENT ON COLUMN well_economics.opex_musd_yr IS 'Annual operating expenditure, millions USD per year.';
COMMENT ON COLUMN well_economics.peak_rate_bopd IS 'Peak oil production rate, barrels of oil per day.';
COMMENT ON COLUMN well_economics.decline_pct_yr IS 'Annual production decline rate, percent per year.';
COMMENT ON COLUMN well_economics.wti_break_even IS 'WTI oil price at which the well breaks even, USD per barrel. Lower is more economic. Well is economic when WTI spot exceeds this value.';
COMMENT ON COLUMN well_economics.npv10_base_musd IS 'NPV at 10 pct discount under the ORIGINAL underwriting plan, millions USD. Use only for plan-vs-actual comparison, never for current rankings.';
COMMENT ON COLUMN well_economics.npv10_live_musd IS 'NPV at 10 pct discount at CURRENT WTI, millions USD. Use this for all current rankings, top-N, and screening.';
COMMENT ON COLUMN well_economics.irr_pct IS 'Internal rate of return, percent. Not additive: average it, never sum it.';
COMMENT ON COLUMN well_economics.payback_years IS 'Years to recover capex at current economics.';
COMMENT ON COLUMN well_economics.co2_tonnes_yr IS 'CO2 emissions attributable to the well, tonnes per year.';
COMMENT ON COLUMN well_economics.margin_per_bbl IS 'Operating margin per barrel at current WTI, USD per barrel.';

-- ----------------------------------------------------------------------------
-- 2. Relationships (the ontology graph). NOT ENFORCED in UC; declared RELY so
--    Genie and the optimizer trust them for joins. PK columns must be NOT NULL.
-- ----------------------------------------------------------------------------
ALTER TABLE operator_wells    ALTER COLUMN well_id  SET NOT NULL;
ALTER TABLE well_economics    ALTER COLUMN well_id  SET NOT NULL;
ALTER TABLE well_h2s_profile  ALTER COLUMN well_id  SET NOT NULL;
ALTER TABLE wellbore_analogs  ALTER COLUMN well_key SET NOT NULL;

ALTER TABLE operator_wells   ADD CONSTRAINT wells_pk        PRIMARY KEY (well_id) RELY;
ALTER TABLE wellbore_analogs ADD CONSTRAINT analogs_pk      PRIMARY KEY (well_key) RELY;
ALTER TABLE well_economics   ADD CONSTRAINT econ_pk         PRIMARY KEY (well_id) RELY;
ALTER TABLE well_h2s_profile ADD CONSTRAINT h2s_pk          PRIMARY KEY (well_id) RELY;

ALTER TABLE well_economics
  ADD CONSTRAINT econ_well_fk FOREIGN KEY (well_id) REFERENCES operator_wells(well_id) RELY;
ALTER TABLE well_h2s_profile
  ADD CONSTRAINT h2s_well_fk  FOREIGN KEY (well_id) REFERENCES operator_wells(well_id) RELY;

-- ----------------------------------------------------------------------------
-- 3. Metric Views (single-source canonical definitions). These bake the Genie
--    ontology rules into governed objects: live NPV, status filter, AVG-not-SUM.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW mv_well_economics
WITH METRICS
LANGUAGE YAML
AS $$
version: 0.1
source: oil_pump_monitor_catalog.subsurface_command.well_economics
filter: status IN ('gold','qc_complete','corrected')
dimensions:
  - name: Well
    expr: well_name
  - name: Basin
    expr: basin
  - name: Status
    expr: status
measures:
  - name: Total NPV10 Live (MUSD)
    expr: SUM(npv10_live_musd)
  - name: Avg NPV10 Live (MUSD)
    expr: AVG(npv10_live_musd)
  - name: Total Capex (MUSD)
    expr: SUM(capex_musd)
  - name: Total Opex per Yr (MUSD)
    expr: SUM(opex_musd_yr)
  - name: Avg IRR (pct)
    expr: AVG(irr_pct)
  - name: Avg Breakeven WTI
    expr: AVG(wti_break_even)
  - name: Avg Payback (yrs)
    expr: AVG(payback_years)
  - name: Avg Margin per bbl
    expr: AVG(margin_per_bbl)
  - name: Total CO2 (tonnes/yr)
    expr: SUM(co2_tonnes_yr)
  - name: Well Count
    expr: COUNT(DISTINCT well_id)
$$;
COMMENT ON VIEW mv_well_economics IS 'Governed well economics by basin, well, and status. Trusted-quality rows only (status gold/qc_complete/corrected). Uses live NPV10 for current rankings. Use for NPV, IRR, breakeven, capex, opex, margin, payback, and CO2 questions. IRR and breakeven are averaged, never summed.';

CREATE OR REPLACE VIEW mv_well_portfolio
WITH METRICS
LANGUAGE YAML
AS $$
version: 0.1
source: oil_pump_monitor_catalog.subsurface_command.operator_wells
dimensions:
  - name: Basin
    expr: basin
  - name: State
    expr: state
  - name: Well Type
    expr: well_type
measures:
  - name: Well Count
    expr: COUNT(DISTINCT well_id)
  - name: Avg Total Depth (ft)
    expr: AVG(total_depth_ft)
  - name: Max Total Depth (ft)
    expr: MAX(total_depth_ft)
$$;
COMMENT ON VIEW mv_well_portfolio IS 'Governed well-portfolio counts and depth by basin, state, and well type. Use for how many wells, portfolio composition, and depth questions.';

-- ----------------------------------------------------------------------------
-- 4. Certified functions (trusted assets for Genie)
-- ----------------------------------------------------------------------------
-- FIX: rewrite f_wells_within_km to use the pre-computed great-circle
-- well_distances table (matches Genie Rule 3) instead of buggy planar ST_Distance.
CREATE OR REPLACE FUNCTION f_wells_within_km(p_well_id STRING, p_radius_km DOUBLE)
  RETURNS TABLE (well_id STRING, well_name STRING, basin STRING, km DOUBLE, same_basin BOOLEAN)
  COMMENT 'Wells within p_radius_km of the given well, using pre-computed great-circle distances. Answers proximity, nearest-offset, and well-spacing questions.'
  RETURN
    SELECT to_well AS well_id, to_name AS well_name, to_basin AS basin, km, same_basin
    FROM oil_pump_monitor_catalog.subsurface_command.well_distances
    WHERE from_well = p_well_id AND km <= p_radius_km
    ORDER BY km;

-- New: well profile joining identity + economics + H2S safety in one governed answer.
CREATE OR REPLACE FUNCTION f_well_profile(p_well_id STRING)
  RETURNS TABLE (well_id STRING, well_name STRING, basin STRING, state STRING, well_type STRING,
                 total_depth_ft DOUBLE, npv10_live_musd DOUBLE, irr_pct DOUBLE, wti_break_even DOUBLE,
                 margin_per_bbl DOUBLE, status STRING, h2s_risk_level STRING, sour_classified BOOLEAN,
                 safety_status STRING)
  COMMENT 'Full profile for one well: identity, live economics, and H2S safety status. Answers: tell me about well X.'
  RETURN
    SELECT w.well_id, w.well_name, w.basin, w.state, w.well_type, w.total_depth_ft,
           e.npv10_live_musd, e.irr_pct, e.wti_break_even, e.margin_per_bbl, e.status,
           h.h2s_risk_level, h.sour_classified, h.safety_status
    FROM operator_wells w
    LEFT JOIN well_economics   e ON w.well_id = e.well_id
    LEFT JOIN well_h2s_profile h ON w.well_id = h.well_id
    WHERE w.well_id = p_well_id;

-- New: wells economic at a given WTI price (encodes Rule 9 as a trusted asset).
CREATE OR REPLACE FUNCTION f_wells_economic_at_wti(p_wti DOUBLE)
  RETURNS TABLE (well_id STRING, well_name STRING, basin STRING, wti_break_even DOUBLE,
                 npv10_live_musd DOUBLE, margin_per_bbl DOUBLE)
  COMMENT 'Trusted-quality wells that are economic at a given WTI price (breakeven below p_wti). Answers: which wells are economic at $X WTI.'
  RETURN
    SELECT well_id, well_name, basin, wti_break_even, npv10_live_musd, margin_per_bbl
    FROM well_economics
    WHERE status IN ('gold','qc_complete','corrected') AND wti_break_even < p_wti
    ORDER BY wti_break_even;

-- ============================================================================
-- 5. Equipment Integrity (H2S / sour-service) — one governed source of truth
--    shared by the Oilfield Equipment tab, the Supervisor's Equipment gate,
--    and Genie. Mirrors server/equipment.py exactly (NACE MR0175 / ISO 15156).
-- ============================================================================

-- 5a. Static component × severity-band spec matrix (the engine's catalogue).
--     Bands: sweet · low · moderate · high · extreme.
CREATE OR REPLACE TABLE equipment_component_spec AS
SELECT * FROM VALUES
  -- component_id, component_name, comp_group, band, required_spec, mechanism, risk, capex_musd, lead_weeks
  ('tubulars','Production tubulars / casing','downhole','sweet','P110 (standard)','none',5,0.0,0),
  ('tubulars','Production tubulars / casing','downhole','low','L80 Type 1 (controlled hardness)','SSC',45,0.35,3),
  ('tubulars','Production tubulars / casing','downhole','moderate','L80 Type 1, HRC <= 22 (NACE MR0175)','SSC',68,0.9,6),
  ('tubulars','Production tubulars / casing','downhole','high','L80 / 13Cr sour grade, HIC-tested','SSC + HIC',85,1.8,10),
  ('tubulars','Production tubulars / casing','downhole','extreme','25Cr super-duplex CRA','SSC + HIC + wt. loss',96,3.6,18),
  ('wellhead','Wellhead & Christmas tree','downhole','sweet','API 6A AA trim','none',4,0.0,0),
  ('wellhead','Wellhead & Christmas tree','downhole','low','API 6A DD trim','SSC',40,0.2,4),
  ('wellhead','Wellhead & Christmas tree','downhole','moderate','API 6A EE-NL sour trim','SSC',62,0.55,8),
  ('wellhead','Wellhead & Christmas tree','downhole','high','API 6A FF sour trim (NACE)','SSC + HIC',80,1.1,14),
  ('wellhead','Wellhead & Christmas tree','downhole','extreme','API 6A HH CRA-clad sour trim','SSC + HIC',92,2.2,22),
  ('packer_elastomers','Packers & downhole elastomers / seals','downhole','sweet','NBR elastomers','none',6,0.0,0),
  ('packer_elastomers','Packers & downhole elastomers / seals','downhole','low','HNBR elastomers','swell/ED',38,0.08,2),
  ('packer_elastomers','Packers & downhole elastomers / seals','downhole','moderate','HNBR, ED-rated','explosive decompression',60,0.18,4),
  ('packer_elastomers','Packers & downhole elastomers / seals','downhole','high','Aflas (FEPM), ED-rated','explosive decompression',78,0.4,7),
  ('packer_elastomers','Packers & downhole elastomers / seals','downhole','extreme','FFKM / Aflas, ED + high-temp rated','ED + thermal',90,0.75,12),
  ('esp_metallurgy','ESP pump & motor metallurgy','esp','sweet','Standard Ni-resist','none',8,0.0,0),
  ('esp_metallurgy','ESP pump & motor metallurgy','esp','low','Ni-resist + monel hardware','pitting',44,0.15,4),
  ('esp_metallurgy','ESP pump & motor metallurgy','esp','moderate','Duplex SS stages, monel bolting','SSC + pitting',66,0.42,9),
  ('esp_metallurgy','ESP pump & motor metallurgy','esp','high','Super-duplex stages, Inconel shafts','SSC + HIC',83,0.85,15),
  ('esp_metallurgy','ESP pump & motor metallurgy','esp','extreme','Full Inconel / Hastelloy wetted path','SSC + HIC + erosion',95,1.6,24),
  ('esp_elastomers','ESP elastomers & seal section','esp','sweet','NBR seal section','none',7,0.0,0),
  ('esp_elastomers','ESP elastomers & seal section','esp','low','HNBR seal section','swell',41,0.05,2),
  ('esp_elastomers','ESP elastomers & seal section','esp','moderate','HNBR + Aflas bag','H2S attack',63,0.12,5),
  ('esp_elastomers','ESP elastomers & seal section','esp','high','Aflas seal section','H2S attack',81,0.28,8),
  ('esp_elastomers','ESP elastomers & seal section','esp','extreme','FFKM seal section','H2S + thermal',93,0.55,13),
  ('flowlines','Flowlines & gathering','surface','sweet','API 5L carbon steel','none',5,0.0,0),
  ('flowlines','Flowlines & gathering','surface','low','Carbon steel + inhibitor program','wt. loss',42,0.12,2),
  ('flowlines','Flowlines & gathering','surface','moderate','HIC-resistant plate + 3mm CA','HIC + wt. loss',64,0.5,6),
  ('flowlines','Flowlines & gathering','surface','high','CRA-clad (316L) line pipe','HIC + wt. loss',82,1.3,12),
  ('flowlines','Flowlines & gathering','surface','extreme','Solid 2205 duplex line pipe','HIC + wt. loss',94,2.8,20),
  ('valves_bop','Valves & BOP stack','surface','sweet','Standard trim','none',4,0.0,0),
  ('valves_bop','Valves & BOP stack','surface','low','NACE-trim gate valves','SSC',39,0.18,3),
  ('valves_bop','Valves & BOP stack','surface','moderate','H2S-rated BOP + NACE valves','SSC',61,0.6,7),
  ('valves_bop','Valves & BOP stack','surface','high','H2S-rated BOP, CRA-trim valves','SSC + HIC',79,1.2,12),
  ('valves_bop','Valves & BOP stack','surface','extreme','Full CRA sour BOP & valve suite','SSC + HIC',91,2.4,20),
  ('inhibitor','Corrosion inhibitor & monitoring','surface','sweet','Not required','none',2,0.0,0),
  ('inhibitor','Corrosion inhibitor & monitoring','surface','low','Batch inhibitor + coupons','wt. loss',30,0.04,1),
  ('inhibitor','Corrosion inhibitor & monitoring','surface','moderate','Continuous inhibitor + ER probes','wt. loss',48,0.1,2),
  ('inhibitor','Corrosion inhibitor & monitoring','surface','high','Continuous inhibitor + online ER/LPR','wt. loss',66,0.22,4),
  ('inhibitor','Corrosion inhibitor & monitoring','surface','extreme','Continuous inhibitor + inline inspection','wt. loss',80,0.45,6)
  AS t(component_id, component_name, comp_group, band, required_spec, mechanism, risk_score, capex_musd, lead_weeks);

COMMENT ON TABLE equipment_component_spec IS
  'NACE MR0175 / ISO 15156 sour-service spec matrix: for each equipment component and H2S severity band (sweet/low/moderate/high/extreme), the required spec, dominant degradation mechanism (SSC/HIC/weight-loss), baseline-risk score, capex premium (MUSD) and procurement lead time (weeks). Reference for equipment questions.';

-- 5b. Per-well H2S severity band (matches server/equipment.py severity_for()).
CREATE OR REPLACE VIEW v_well_sour_band AS
SELECT
  well_id,
  well_name,
  basin,
  h2s_ppm_last_measured AS h2s_ppm,
  sour_classified,
  CASE
    WHEN h2s_ppm_last_measured >= 10000 THEN 'extreme'
    WHEN h2s_ppm_last_measured >= 2000  THEN 'high'
    WHEN h2s_ppm_last_measured >= 100   THEN 'moderate'
    WHEN sour_classified                THEN 'moderate'  -- classification overrides low ppm
    WHEN h2s_ppm_last_measured >= 10    THEN 'low'
    ELSE 'sweet'
  END AS severity_band
FROM well_h2s_profile;
COMMENT ON VIEW v_well_sour_band IS 'Each well mapped to its H2S sour-service severity band (sweet/low/moderate/high/extreme). A governed sour classification never falls below moderate.';

-- 5c. Governed per-well-per-component equipment integrity (the shared table).
CREATE OR REPLACE VIEW well_equipment_integrity AS
SELECT
  b.well_id,
  b.well_name,
  b.basin,
  b.h2s_ppm,
  b.sour_classified,
  b.severity_band,
  s.component_id,
  s.component_name,
  s.comp_group        AS component_group,
  s.required_spec,
  s.mechanism         AS degradation_mechanism,
  s.risk_score,
  s.capex_musd        AS upgrade_capex_musd,
  s.lead_weeks        AS upgrade_lead_weeks,
  (s.capex_musd > 0)  AS upgrade_required
FROM v_well_sour_band b
JOIN equipment_component_spec s ON s.band = b.severity_band;
COMMENT ON VIEW well_equipment_integrity IS
  'Sour-service equipment integrity, one row per well per component. Given the well H2S severity, gives the required NACE MR0175 spec, degradation mechanism (SSC/HIC/corrosion), risk score, upgrade capex (MUSD) and lead time (weeks). Answers: which wells need sour wellheads, what metallurgy does well X need, total sour-service capex, degradation risk by component.';

-- 5d. Certified function: equipment spec for one well (trusted Genie asset).
CREATE OR REPLACE FUNCTION f_equipment_spec_for_well(p_well_id STRING)
  RETURNS TABLE (component_name STRING, component_group STRING, required_spec STRING,
                 degradation_mechanism STRING, risk_score INT, upgrade_capex_musd DOUBLE,
                 upgrade_lead_weeks INT, upgrade_required BOOLEAN)
  COMMENT 'Sour-service equipment spec for one well: per-component required NACE MR0175 metallurgy, degradation mechanism, risk, capex and lead time. Answers: what equipment / metallurgy does well X need for its H2S.'
  RETURN
    SELECT component_name, component_group, required_spec, degradation_mechanism,
           risk_score, upgrade_capex_musd, upgrade_lead_weeks, upgrade_required
    FROM well_equipment_integrity
    WHERE well_id = p_well_id
    ORDER BY risk_score DESC;

-- 5e. Metric view: governed rollups for equipment integrity.
CREATE OR REPLACE VIEW mv_equipment_integrity
WITH METRICS
LANGUAGE YAML
AS $$
version: 0.1
source: oil_pump_monitor_catalog.subsurface_command.well_equipment_integrity
dimensions:
  - name: Well
    expr: well_name
  - name: Basin
    expr: basin
  - name: Severity Band
    expr: severity_band
  - name: Component
    expr: component_name
  - name: Component Group
    expr: component_group
measures:
  - name: Total Sour Capex (MUSD)
    expr: SUM(upgrade_capex_musd)
  - name: Max Lead Weeks
    expr: MAX(upgrade_lead_weeks)
  - name: Avg Risk Score
    expr: AVG(risk_score)
  - name: Upgrades Required
    expr: SUM(CASE WHEN upgrade_required THEN 1 ELSE 0 END)
  - name: Well Count
    expr: COUNT(DISTINCT well_id)
$$;
COMMENT ON VIEW mv_equipment_integrity IS 'Governed equipment-integrity metrics by well, basin, severity band, and component. Use for sour-service capex, lead time, degradation risk, and how many components need upgrade.';

-- ----------------------------------------------------------------------------
-- Genie Space instructions to add (paste into the Space's Instructions):
--   • "Sour", "H2S", "sour service" → severity_band in well_equipment_integrity
--     (sweet/low/moderate/high/extreme). Sour-classified wells are never below moderate.
--   • Equipment / metallurgy / "what does well X need" → f_equipment_spec_for_well(well_id)
--     or well_equipment_integrity filtered to the well.
--   • "which wells need sour wellheads / sour tubulars / ESP upgrades" →
--     well_equipment_integrity WHERE component_id/name matches AND upgrade_required.
--   • Degradation mechanisms: SSC = Sulfide Stress Cracking, HIC = Hydrogen-Induced
--     Cracking, "wt. loss" = weight-loss corrosion.
--   • Sour-service capex = SUM(upgrade_capex_musd); procurement risk = MAX(upgrade_lead_weeks).
-- ----------------------------------------------------------------------------
