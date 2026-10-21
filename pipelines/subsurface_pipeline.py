"""
Subsurface Command: Lakeflow Spark Declarative Pipeline.

  bronze  raw exports landed by Auto Loader, untouched, with file lineage
  silver  typed and quality-controlled logs: despiked, gaps flagged, range
          checked, every sample tagged with its formation
  gold    the interpretation layer the app, Genie, and the sonic model read:
          per-sample petrophysics, per-zone net pay, and the well register

Design choices
  * Bronze is streaming (Auto Loader): a new well's LAS export is a new file,
    and only the new file is processed.
  * QC is done in the pipeline, not in the app. A spike is a sample more than
    a curve-specific threshold away from its +-5 sample moving average; the
    sample is nulled and flagged, never silently smoothed. Expectations record
    how many samples each rule touched.
  * Porosity is the density-neutron (gas-corrected) estimate, so the gas zone
    in Westwater does not read tight on density alone. Vcl is linear GR, Sw is
    Archie, and pay uses explicit cut-offs. The same constants are used in the
    app's petrophysics recipe (server/schema.py).

  * Governance is declared here, on the table, not in the app: gold_zone_summary
    carries a basin row filter and masks on the interpreted columns, so the
    same rules hold in the app, Genie, and the SQL editor.

Pipeline configuration: raw_root = /Volumes/<catalog>/<schema>/raw
                        policy_schema = <catalog>.<schema>
"""
from pyspark import pipelines as dp
from pyspark.sql import Window
from pyspark.sql import functions as F

RAW = spark.conf.get("raw_root")  # noqa: F821  (spark is injected by the pipeline runtime)
# Schema holding the governance functions (governance/policies.sql), created
# by the build job before this pipeline runs.
POLICY = spark.conf.get("policy_schema")  # noqa: F821

GR_CLEAN, GR_SHALE = 20.0, 120.0
RHO_MA, RHO_FL, NPHI_SHALE = 2.65, 1.0, 0.22
RW, ARCHIE_M, ARCHIE_N = 0.05, 2.0, 2.0
PAY_PHI, PAY_SW, PAY_VCL = 0.08, 0.50, 0.35
SAMPLE_FT = 2.0

# curve -> (spike threshold vs moving average, valid range)
CURVES = {
    "gr_api":   (60.0,  (0.0, 250.0)),
    "rhob_gcc": (0.25,  (1.5, 3.0)),
    "nphi_vv":  (0.15,  (-0.15, 0.6)),
    "dt_usft":  (30.0,  (40.0, 200.0)),
    "log_rt":   (0.8,   (-2.0, 4.0)),
}


def _autoload(subdir: str, **opts):
    reader = (spark.readStream.format("cloudFiles")  # noqa: F821
              .option("cloudFiles.format", "csv")
              .option("header", "true")
              .option("cloudFiles.inferColumnTypes", "true"))
    for k, v in opts.items():
        reader = reader.option(k, v)
    return (reader.load(f"{RAW}/{subdir}")
            .withColumn("_source_file", F.col("_metadata.file_path"))
            .withColumn("_ingested_at", F.current_timestamp()))


# ── Bronze ────────────────────────────────────────────────────────────────────

@dp.table(comment="Raw LAS-style log exports, one row per depth sample per well.")
def bronze_logs():
    return _autoload("logs")


@dp.table(comment="Raw well master export.")
def bronze_well_header():
    return _autoload("wells")


@dp.table(comment="Raw formation tops picks.")
def bronze_formation_tops():
    return _autoload("tops")


# ── Silver ────────────────────────────────────────────────────────────────────

@dp.materialized_view(comment="Well register: typed headers. role = app_well or training_offset.")
@dp.expect_or_drop("has_id", "well_id IS NOT NULL")
@dp.expect("located", "lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180")
def silver_wells():
    return (spark.read.table("bronze_well_header")  # noqa: F821
            .select("well_id", "well_name", "field_name", "basin", "state",
                    F.col("lat").cast("double").alias("lat"), F.col("lon").cast("double").alias("lon"),
                    F.col("total_depth_ft").cast("double").alias("total_depth_ft"),
                    "well_type", "status", "role"))


@dp.materialized_view(comment="Quality-controlled logs: spikes nulled and flagged, gaps flagged, formation tagged.")
@dp.expect_or_drop("has_depth", "md_ft IS NOT NULL AND well_id IS NOT NULL")
@dp.expect("rhob_in_range", "rhob_gcc IS NULL OR rhob_gcc BETWEEN 1.5 AND 3.0")
@dp.expect("gr_in_range", "gr_api IS NULL OR gr_api BETWEEN 0 AND 250")
@dp.expect("rt_positive", "rt_ohmm IS NULL OR rt_ohmm > 0")
def silver_logs():
    logs = (spark.read.table("bronze_logs")  # noqa: F821
            .select("well_id", F.col("md_ft").cast("double").alias("md_ft"),
                    *[F.col(c).cast("double").alias(c) for c in
                      ("gr_api", "rt_ohmm", "rhob_gcc", "nphi_vv", "dt_usft", "cali_in", "pef_be")])
            .withColumn("log_rt", F.log10(F.when(F.col("rt_ohmm") > 0, F.col("rt_ohmm")))))
    near = Window.partitionBy("well_id").orderBy("md_ft").rowsBetween(-5, 5)
    for c, (thresh, (lo, hi)) in CURVES.items():
        avg = F.avg(c).over(near)
        bad = (F.abs(F.col(c) - avg) > thresh) | (F.col(c) < lo) | (F.col(c) > hi)
        logs = (logs.withColumn(f"{c}_qc", F.when(F.col(c).isNull(), F.lit("gap"))
                                .when(bad, F.lit("spike")).otherwise(F.lit("ok")))
                .withColumn(c, F.when(F.col(f"{c}_qc") == "ok", F.col(c))))
    logs = logs.withColumn("rt_ohmm", F.when(F.col("log_rt_qc") == "ok", F.col("rt_ohmm")))
    tops = spark.read.table("bronze_formation_tops")  # noqa: F821
    return (logs.join(tops.select("well_id", "formation_name", F.col("zone_index").cast("int").alias("zone_index"),
                                  F.col("top_md_ft").cast("double").alias("top"),
                                  F.col("base_md_ft").cast("double").alias("base"), "zone_type"), "well_id")
            .where((F.col("md_ft") >= F.col("top")) &
                   ((F.col("md_ft") < F.col("base")) | ((F.col("zone_index") == 5) & (F.col("md_ft") <= F.col("base")))))
            .drop("top", "base"))


# ── Gold ──────────────────────────────────────────────────────────────────────

@dp.materialized_view(comment="Per-sample petrophysics: Vcl (linear GR), density-neutron porosity, Archie Sw, pay flag.")
def gold_petrophysics():
    s = spark.read.table("silver_logs")  # noqa: F821
    vcl = F.least(F.lit(1.0), F.greatest(F.lit(0.0), (F.col("gr_api") - GR_CLEAN) / (GR_SHALE - GR_CLEAN)))
    phi_d = (F.lit(RHO_MA) - F.col("rhob_gcc")) / (RHO_MA - RHO_FL)
    phi_n = F.col("nphi_vv") - NPHI_SHALE * F.col("vcl")
    phi_t = F.least(F.lit(0.45), F.greatest(F.lit(0.0), F.sqrt((phi_d * phi_d + phi_n * phi_n) / 2)))
    sw = F.least(F.lit(1.0), F.pow(F.lit(RW) / (F.pow(F.col("phi_eff"), ARCHIE_M) * F.col("rt_ohmm")), 1 / ARCHIE_N))
    w = spark.read.table("silver_wells").select("well_id", "basin", "role")  # noqa: F821
    return (s.withColumn("vcl", vcl)
            .withColumn("phi_total", phi_t)
            .withColumn("phi_eff", F.col("phi_total") * (1 - F.col("vcl")))
            .withColumn("sw", F.when(F.col("phi_eff") > 0.02, sw).otherwise(F.lit(1.0)))
            .withColumn("is_pay", (F.col("phi_eff") >= PAY_PHI) & (F.col("sw") <= PAY_SW) & (F.col("vcl") <= PAY_VCL))
            .withColumn("hc_pore_ft", F.when(F.col("is_pay"), F.col("phi_eff") * (1 - F.col("sw")) * SAMPLE_FT)
                        .otherwise(F.lit(0.0)))
            .join(w, "well_id", "left")
            .select("well_id", "basin", "role", "md_ft", "formation_name", "zone_index", "zone_type",
                    "gr_api", "rt_ohmm", "log_rt", "rhob_gcc", "nphi_vv", "dt_usft",
                    "vcl", "phi_total", "phi_eff", "sw", "is_pay", "hc_pore_ft",
                    "gr_api_qc", "rhob_gcc_qc", "nphi_vv_qc", "dt_usft_qc", "log_rt_qc"))


ZONE_SUMMARY_SCHEMA = f"""
  well_id STRING, basin STRING, role STRING, formation_name STRING, zone_index INT, zone_type STRING,
  gross_ft DOUBLE, net_pay_ft DOUBLE, net_to_gross DOUBLE,
  avg_pay_phi DOUBLE, avg_pay_sw DOUBLE MASK {POLICY}.mask_interpretation,
  avg_vcl DOUBLE, hc_pore_ft DOUBLE MASK {POLICY}.mask_interpretation, dt_missing_frac DOUBLE
"""


@dp.materialized_view(
    comment="Net pay per well and formation: the numbers a completion decision starts from. "
            "JV partners see only their basins, and not the interpreted Sw or hydrocarbon pore volume.",
    schema=ZONE_SUMMARY_SCHEMA,
    row_filter=f"ROW FILTER {POLICY}.basin_filter ON (basin)")
def gold_zone_summary():
    p = spark.read.table("gold_petrophysics")  # noqa: F821
    d = lambda c: c.cast("double")  # noqa: E731
    return (p.groupBy("well_id", "basin", "role", "formation_name", "zone_index", "zone_type")
            .agg(d(F.round(F.count("*") * SAMPLE_FT, 1)).alias("gross_ft"),
                 d(F.round(F.sum(F.col("is_pay").cast("int")) * SAMPLE_FT, 1)).alias("net_pay_ft"),
                 d(F.round(F.avg(F.when(F.col("is_pay"), F.col("phi_eff"))), 4)).alias("avg_pay_phi"),
                 d(F.round(F.avg(F.when(F.col("is_pay"), F.col("sw"))), 4)).alias("avg_pay_sw"),
                 d(F.round(F.avg("vcl"), 4)).alias("avg_vcl"),
                 d(F.round(F.sum("hc_pore_ft"), 3)).alias("hc_pore_ft"),
                 d(F.round(F.avg(F.col("dt_usft").isNull().cast("int")), 3)).alias("dt_missing_frac"))
            .withColumn("net_to_gross", d(F.round(F.col("net_pay_ft") / F.col("gross_ft"), 3)))
            .select("well_id", "basin", "role", "formation_name", F.col("zone_index").cast("int"), "zone_type",
                    "gross_ft", "net_pay_ft", "net_to_gross", "avg_pay_phi", "avg_pay_sw", "avg_vcl",
                    "hc_pore_ft", "dt_missing_frac"))


@dp.materialized_view(comment="Model-ready sonic training rows: all QC-passed samples with every input curve present.")
def gold_sonic_features():
    return (spark.read.table("gold_petrophysics")  # noqa: F821
            .where("gr_api IS NOT NULL AND rhob_gcc IS NOT NULL AND nphi_vv IS NOT NULL AND log_rt IS NOT NULL")
            .select("well_id", "basin", "role", "md_ft", "formation_name", "zone_index",
                    "gr_api", "rhob_gcc", "nphi_vv", "log_rt", "dt_usft"))
