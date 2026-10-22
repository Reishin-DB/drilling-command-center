"""Live drift check for the served synthetic-sonic model.

Turns the evaluation harness into monitoring. For every well with measured
sonic, score the served model through its endpoint and compare it with the
calibrated Gardner baseline (the same log-linear fit the training job uses).
A well is in drift when the model's error exceeds either bar:

  * 1.5x the champion's leave-one-well-out MAE (it has degraded against its
    own validated accuracy), or
  * the calibrated Gardner error on that well (it no longer beats the method
    engineers would fall back to).

Results append to gold_sonic_drift_checks. If any well drifts and --trigger is
set, the build job's train_serve_score task is run to retrain, re-evaluate and
redeploy the champion.

Every well with measured sonic today was in the training set, so a routine run
is in-sample monitoring. --simulate-well adds a new well built from an existing
one with a tool change, to exercise the drift path. Two failure modes:
  nphi  neutron-tool calibration shift (NPHI +0.12 v/v)
  gr    gamma-ray tool reading hot after a vendor or tool-string change (GR x1.3)
"""
import argparse
import re
import datetime as dt
import uuid

import numpy as np
import pandas as pd
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import DataframeSplitInput
from pyspark.sql import SparkSession

FEATURES = ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"]
TARGET = "dt_usft"
ENDPOINT = "subsurface-synthetic-sonic"
DEGRADE_FACTOR = 1.5


def predict(w, df: pd.DataFrame) -> np.ndarray:
    out = []
    for i in range(0, len(df), 500):
        part = df.iloc[i:i + 500]
        data = [[float(r.gr_api), float(r.rhob_gcc), float(r.nphi_vv), float(r.log_rt), float(r.md_ft), int(r.zone_index)]
                for r in part.itertuples()]
        out += w.serving_endpoints.query(name=ENDPOINT, dataframe_split=DataframeSplitInput(columns=FEATURES, data=data)).predictions
    return np.array(out, dtype=float)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", required=True)
    ap.add_argument("--simulate-well", default="", help="source well for a simulated new well with an NPHI calibration shift")
    ap.add_argument("--drift-mode", default="nphi", choices=["nphi", "gr"])
    ap.add_argument("--nphi-shift", type=float, default=0.12)
    ap.add_argument("--gr-scale", type=float, default=1.3)
    ap.add_argument("--trigger", action="store_true", help="retrain when any well drifts")
    ap.add_argument("--max-samples", type=int, default=1200)
    a = ap.parse_args()
    fq = f"{a.catalog}.{a.schema}"
    spark = SparkSession.builder.getOrCreate()
    w = WorkspaceClient()

    feats = spark.read.table(f"{fq}.gold_sonic_features").toPandas()
    lab = feats[feats[TARGET].notna()].reset_index(drop=True)
    champ = spark.sql(f"SELECT method, mae, model_version FROM {fq}.gold_sonic_model_metrics WHERE is_champion").collect()[0]
    bar = DEGRADE_FACTOR * float(champ.mae)

    wells = {wid: g for wid, g in lab.groupby("well_id")}
    if a.simulate_well:
        sim = wells[a.simulate_well].copy()
        if a.drift_mode == "gr":
            sim["gr_api"] = sim["gr_api"] * a.gr_scale
            wells[f"NEW-{a.simulate_well}-GRx{a.gr_scale:g}"] = sim
        else:
            sim["nphi_vv"] = sim["nphi_vv"] + a.nphi_shift
            wells[f"NEW-{a.simulate_well}-NPHI+{a.nphi_shift:g}"] = sim

    check_id, now, rows = str(uuid.uuid4()), dt.datetime.now(dt.timezone.utc), []
    for wid, g in sorted(wells.items()):
        g = g.sort_values("md_ft").iloc[:: max(1, len(g) // a.max_samples)]
        # Calibrated Gardner, fit on every other well (the same log-linear form the training job uses).
        rest = lab[lab.well_id != re.sub(r"^NEW-|-(NPHI|GR).*$", "", wid)]
        b, c = np.polyfit(np.log(rest.rhob_gcc), np.log(rest[TARGET]), 1)
        gard = np.exp(c + b * np.log(g.rhob_gcc.to_numpy()))
        pred = predict(w, g)
        y = g[TARGET].to_numpy()
        m_mae, g_mae = float(np.mean(np.abs(pred - y))), float(np.mean(np.abs(gard - y)))
        drift = m_mae > bar or m_mae > g_mae
        rows.append({"check_id": check_id, "checked_at": now, "well_id": wid, "simulated": wid.startswith("NEW-"),
                     "in_training_set": not wid.startswith("NEW-"), "n_samples": int(len(g)),
                     "model_mae": round(m_mae, 3), "gardner_mae": round(g_mae, 3), "degrade_bar": round(bar, 3),
                     "drift": bool(drift), "model_version": str(champ.model_version)})
        print(f"{wid:28s} n={len(g):5d}  model {m_mae:6.2f}  gardner {g_mae:6.2f}  bar {bar:5.2f}  {'DRIFT' if drift else 'ok'}")

    drifted = [r["well_id"] for r in rows if r["drift"]]
    action, run_id = "none", None
    if drifted and a.trigger:
        job = next(j for j in w.jobs.list(name="subsurface-command-build"))
        run_id = w.jobs.run_now(job_id=job.job_id, only=["train_serve_score"]).run_id
        action = f"retrain triggered: subsurface-command-build run {run_id} (train_serve_score)"
    elif drifted:
        action = "drift found; retrain not triggered (run without --trigger)"
    for r in rows:
        r["action"] = action
    (spark.createDataFrame(pd.DataFrame(rows)).write.mode("append").option("mergeSchema", "true")
     .saveAsTable(f"{fq}.gold_sonic_drift_checks"))
    print(f"check {check_id}: {len(drifted)} of {len(rows)} wells in drift; action: {action}")


if __name__ == "__main__":
    main()
