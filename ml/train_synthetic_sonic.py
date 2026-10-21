"""
Train, register, serve, and batch-score the synthetic-sonic model.

Input   gold_sonic_features (from the pipeline): QC-passed samples with GR,
        RHOB, NPHI, log10 RT, depth, and formation, plus the measured DT.
Output  UC model   <catalog>.<schema>.synthetic_sonic   (alias: champion)
        endpoint   subsurface-synthetic-sonic           (scale to zero, AI Gateway)
        tables     gold_synthetic_sonic        (every app-well sample: model vs Gardner vs measured)
                   gold_sonic_model_metrics    (the evaluation, one row per method)

Why: GREENRIVER-03 has no sonic, and geomechanics (pore pressure, wellbore
stability, completion design) needs one. Today a petrophysicist reaches for
Gardner's density-to-velocity transform. The model has to beat that.

Evaluation holds out whole wells, not random rows: neighbouring samples in a
well share the same rock, so a random split would leak. Every method is scored
on the same held-out wells:
  gardner_textbook    rhob = 0.23 V^0.25, published coefficients
  gardner_calibrated  log DT on log RHOB, refit on the training wells (the fair bar)
  faust_calibrated    log DT on log(depth x RT), refit on the training wells
  linear_all_curves   ordinary least squares on the same inputs
  model               gradient-boosted trees on the same inputs

Champion selection: the multi-curve candidate with the lowest held-out MAE,
except that a candidate within TIE_TOLERANCE of a simpler one loses to it.
Simpler wins ties: it is cheaper to serve, easier to explain to a
petrophysicist, and extrapolates more predictably outside the training rocks.
"""
from __future__ import annotations

import argparse
import inspect
import json
import os
import re
from datetime import timedelta

import mlflow
import numpy as np
import pandas as pd
from mlflow.models import infer_signature
from pyspark.sql import SparkSession
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

FEATURES = ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"]
TARGET = "dt_usft"
ENDPOINT = "subsurface-synthetic-sonic"
TIE_TOLERANCE = 0.02
# multi-curve candidates, simplest first
CANDIDATES = {"linear_all_curves": LinearRegression, "model": None}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(inspect.getsourcefile(lambda: 0))))


def gardner_textbook(df: pd.DataFrame) -> np.ndarray:
    """Gardner (1974): rho = 0.23 V^0.25, V in ft/s, so DT = 1e6 / (rho/0.23)^4."""
    return 1e6 / (df.rhob_gcc.to_numpy() / 0.23) ** 4


class LogLinear:
    """log(DT) = a + b log(x): the calibrated form of a one-curve transform."""

    def __init__(self, xfn):
        self.xfn = xfn

    def fit(self, df):
        self.b, self.a = np.polyfit(np.log(self.xfn(df)), np.log(df[TARGET]), 1)
        return self

    def predict(self, df):
        return np.exp(self.a + self.b * np.log(self.xfn(df)))


def gardner_cal():
    return LogLinear(lambda d: d.rhob_gcc.to_numpy())


def faust_cal():
    return LogLinear(lambda d: d.md_ft.to_numpy() * 10 ** d.log_rt.to_numpy())


def choose_champion(pooled: dict) -> str:
    best = None
    for name in CANDIDATES:  # simplest first
        if best is None or pooled[name]["mae"] < pooled[best]["mae"] * (1 - TIE_TOLERANCE):
            best = name
    return best


def build(name: str):
    return LinearRegression() if name == "linear_all_curves" else new_model()


def new_model():
    return HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, max_leaf_nodes=31,
                                         l2_regularization=1.0, random_state=7)


def scores(y, p) -> dict:
    return {"mae": float(mean_absolute_error(y, p)), "rmse": float(np.sqrt(mean_squared_error(y, p))),
            "r2": float(r2_score(y, p)), "bias": float(np.mean(p - y))}


def leave_wells_out(df: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    """Leave-one-well-out: each well is predicted by methods fit on all the others."""
    preds = []
    for well in sorted(df.well_id.unique()):
        tr, te = df[df.well_id != well], df[df.well_id == well]
        out = te[["well_id", "role", TARGET]].copy()
        out["gardner_textbook"] = gardner_textbook(te)
        out["gardner_calibrated"] = gardner_cal().fit(tr).predict(te)
        out["faust_calibrated"] = faust_cal().fit(tr).predict(te)
        out["linear_all_curves"] = LinearRegression().fit(tr[FEATURES], tr[TARGET]).predict(te[FEATURES])
        out["model"] = new_model().fit(tr[FEATURES], tr[TARGET]).predict(te[FEATURES])
        preds.append(out)
    p = pd.concat(preds)
    methods = ["gardner_textbook", "gardner_calibrated", "faust_calibrated", "linear_all_curves", "model"]
    pooled = {m: scores(p[TARGET], p[m]) for m in methods}
    per_well = {m: p.groupby("well_id").apply(lambda g: mean_absolute_error(g[TARGET], g[m])).round(3).to_dict()
                for m in methods}
    return {"pooled": pooled, "per_well_mae": per_well}, p


def apply_policies(spark, fq: str, table: str):
    sql = re.sub(r"--[^\n]*", "", open(os.path.join(ROOT, "governance", "policies.sql")).read())
    for stmt in [x.strip() for x in sql.replace("${schema}", fq).split(";") if x.strip()]:
        spark.sql(stmt)
    spark.sql(f"ALTER TABLE {table} SET ROW FILTER {fq}.basin_filter ON (basin)")


def drop_policies(spark, table: str):
    if spark.catalog.tableExists(table):
        spark.sql(f"ALTER TABLE {table} DROP ROW FILTER")


def deploy_endpoint(model_name: str, version: str, fq: str):
    """Serve the champion behind AI Gateway: usage tracking, an inference table of
    every request and response in Unity Catalog, and a per-endpoint rate limit."""
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.serving import (
        AiGatewayInferenceTableConfig, AiGatewayRateLimit, AiGatewayRateLimitKey,
        AiGatewayRateLimitRenewalPeriod, AiGatewayUsageTrackingConfig,
        EndpointCoreConfigInput, ServedEntityInput)
    w = WorkspaceClient()
    served = [ServedEntityInput(entity_name=model_name, entity_version=version,
                                workload_size="Small", scale_to_zero_enabled=True)]
    if any(e.name == ENDPOINT for e in w.serving_endpoints.list()):
        w.serving_endpoints.wait_get_serving_endpoint_not_updating(ENDPOINT, timeout=timedelta(minutes=40))
        w.serving_endpoints.update_config(name=ENDPOINT, served_entities=served)
    else:
        w.serving_endpoints.create(name=ENDPOINT, config=EndpointCoreConfigInput(name=ENDPOINT, served_entities=served))
    w.serving_endpoints.wait_get_serving_endpoint_not_updating(ENDPOINT, timeout=timedelta(minutes=40))
    catalog, schema = fq.split(".")
    try:
        w.serving_endpoints.put_ai_gateway(
            name=ENDPOINT,
            usage_tracking_config=AiGatewayUsageTrackingConfig(enabled=True),
            inference_table_config=AiGatewayInferenceTableConfig(
                enabled=True, catalog_name=catalog, schema_name=schema, table_name_prefix="sonic_endpoint"),
            rate_limits=[AiGatewayRateLimit(calls=600, key=AiGatewayRateLimitKey.ENDPOINT,
                                            renewal_period=AiGatewayRateLimitRenewalPeriod.MINUTE)])
        print(f"endpoint {ENDPOINT} -> {model_name} v{version} behind AI Gateway")
    except Exception as e:  # the model is served either way; report rather than fail the job
        print(f"endpoint {ENDPOINT} -> {model_name} v{version}; AI Gateway config failed: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", required=True)
    ap.add_argument("--experiment", default="/Shared/subsurface-command-synthetic-sonic")
    ap.add_argument("--skip-endpoint", action="store_true")
    args = ap.parse_args()
    fq = f"{args.catalog}.{args.schema}"
    spark = SparkSession.builder.getOrCreate()

    feats = spark.read.table(f"{fq}.gold_sonic_features").toPandas()
    train = feats[feats[TARGET].notna()].reset_index(drop=True)
    print(f"{len(train)} labelled samples from {train.well_id.nunique()} wells; "
          f"{feats[TARGET].isna().sum()} samples without DT")

    mlflow.set_registry_uri("databricks-uc")
    mlflow.set_experiment(args.experiment)
    with mlflow.start_run(run_name="synthetic-sonic") as run:
        evaluation, _ = leave_wells_out(train)
        for m, s in evaluation["pooled"].items():
            mlflow.log_metrics({f"{m}_{k}": v for k, v in s.items()})
            print(f"  {m:20s} MAE {s['mae']:6.2f}  RMSE {s['rmse']:6.2f}  R2 {s['r2']:6.3f}  bias {s['bias']:+6.2f} us/ft")
        mlflow.log_dict(evaluation, "evaluation.json")
        mlflow.log_params({"features": ",".join(FEATURES), "evaluation": "leave-one-well-out",
                           "n_wells": int(train.well_id.nunique()), "n_samples": int(len(train))})

        champion = choose_champion(evaluation["pooled"])
        evaluation["champion"] = champion
        mlflow.log_param("champion_method", champion)
        print(f"champion: {champion} (ties within {TIE_TOLERANCE:.0%} go to the simpler model)")
        model = build(champion).fit(train[FEATURES], train[TARGET])
        info = mlflow.sklearn.log_model(
            model, name="model", input_example=train[FEATURES].head(5),
            signature=infer_signature(train[FEATURES], model.predict(train[FEATURES].head(5))),
            registered_model_name=f"{fq}.synthetic_sonic")

    version = str(info.registered_model_version)
    mlflow.MlflowClient().set_registered_model_alias(f"{fq}.synthetic_sonic", "champion", version)
    print(f"registered {fq}.synthetic_sonic v{version} @champion (run {run.info.run_id})")

    best = evaluation["pooled"]
    metrics_rows = [{"method": m, **{k: round(v, 4) for k, v in s.items()}, "model_version": version, "is_champion": m == champion,
                     "evaluation": "leave-one-well-out", "n_wells": int(train.well_id.nunique()),
                     "n_samples": int(len(train))} for m, s in best.items()]
    (spark.createDataFrame(pd.DataFrame(metrics_rows)).write.mode("overwrite")
     .option("overwriteSchema", "true").saveAsTable(f"{fq}.gold_sonic_model_metrics"))
    print("METRICS_JSON " + json.dumps({"model_version": version, "endpoint": ENDPOINT, **evaluation}))

    app = feats[feats.role == "app_well"].copy()
    app["dt_model"] = model.predict(app[FEATURES]).round(2)
    app["dt_gardner"] = gardner_textbook(app).round(2)
    app["dt_gardner_calibrated"] = gardner_cal().fit(train).predict(app).round(2)
    app["dt_source"] = np.where(app[TARGET].isna(), "synthetic", "measured")
    app["model_version"] = version
    app = app.rename(columns={TARGET: "dt_measured"})
    cols = ["well_id", "basin", "md_ft", "formation_name", "gr_api", "rhob_gcc", "nphi_vv", "log_rt",
            "dt_measured", "dt_model", "dt_gardner", "dt_gardner_calibrated", "dt_source", "model_version"]
    table = f"{fq}.gold_synthetic_sonic"
    drop_policies(spark, table)
    (spark.createDataFrame(app[cols]).write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(table))
    spark.sql(f"COMMENT ON TABLE {table} IS 'Synthetic sonic for every app-well sample: champion model vs Gardner vs "
              "measured. dt_source = synthetic where the well never acquired DT (GREENRIVER-03). "
              "JV partners only see their basins (governance/policies.sql).'")
    apply_policies(spark, fq, table)
    gr3 = app[app.well_id == "GREENRIVER-03"]
    print(f"GREENRIVER-03 synthetic sonic: {len(gr3)} samples, mean {gr3.dt_model.mean():.1f} us/ft")

    if not args.skip_endpoint:
        deploy_endpoint(f"{fq}.synthetic_sonic", version, fq)


if __name__ == "__main__":
    main()
