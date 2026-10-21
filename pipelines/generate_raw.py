"""
Land the raw well data for Subsurface Command in a Unity Catalog volume.

This plays the part of the operator's well master and log store. Everything is
synthetic (no customer data) but shaped like the real exports:

  wells/   well headers (CSV), one row per well, with a `role` column
  tops/    formation tops picked per well (CSV)
  logs/    one LAS-style CSV per well: raw curves on a 2 ft depth grid, with
           the tool spikes and gaps a real acquisition carries

The six app wells come from the same generator the app seeds DuckDB with
(server/schema.py), so the lakehouse and the app show identical logs. Eight
extra offset wells (role = training_offset) are added only here: they give the
synthetic-sonic model enough whole wells to hold out. They never appear in the
app.

Run as a job task (serverless) with:
    python pipelines/generate_raw.py --catalog <c> --schema <s>
or locally with --out <folder>.
"""
from __future__ import annotations

import argparse
import csv
import inspect
import os
import random
import sys

# Serverless job tasks exec() the file, so __file__ is undefined; the code
# object still knows its own path.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(inspect.getsourcefile(lambda: 0))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server.schema import WELL_LOG_CONFIGS, _WELLS, _ZONES, _gen_log_samples  # noqa: E402

LOG_COLUMNS = ["well_id", "md_ft", "gr_api", "rt_ohmm", "rxo_ohmm", "rhob_gcc", "nphi_vv",
               "dt_usft", "cali_in", "sp_mv", "pef_be"]
# _gen_log_samples row positions for the raw curves above (after well_id)
RAW_IDX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# Offset wells: training data only, near the app wells' basins.
OFFSETS = [
    ("SJ-OFFSET-01", "San Juan", "NM", 36.75, -107.62, 201),
    ("SJ-OFFSET-02", "San Juan", "NM", 36.66, -107.49, 202),
    ("SJ-OFFSET-03", "San Juan", "NM", 36.80, -107.55, 203),
    ("GR-OFFSET-04", "Green River", "WY", 41.73, -107.85, 204),
    ("GR-OFFSET-05", "Green River", "WY", 41.62, -107.99, 205),
    ("PB-OFFSET-06", "Permian Basin", "TX", 31.90, -102.20, 206),
    ("PB-OFFSET-07", "Permian Basin", "TX", 31.30, -101.00, 207),
    ("ET-OFFSET-08", "East Texas", "TX", 31.60, -94.50, 208),
]


def _fmt(v):
    return "" if v is None else v


def write_logs(root: str, well_id: str, rows: list) -> int:
    path = f"{root}/logs/{well_id}.csv"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(LOG_COLUMNS)
        for r in rows:
            wr.writerow([well_id] + [_fmt(r[i]) for i in RAW_IDX])
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", required=True)
    ap.add_argument("--volume", default="raw")
    ap.add_argument("--out", help="write to a local folder instead of the UC volume")
    args = ap.parse_args()

    if args.out:
        root = args.out
    else:
        from pyspark.sql import SparkSession
        spark = SparkSession.builder.getOrCreate()
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {args.catalog}.{args.schema}")
        spark.sql(f"CREATE VOLUME IF NOT EXISTS {args.catalog}.{args.schema}.{args.volume}")
        root = f"/Volumes/{args.catalog}/{args.schema}/{args.volume}"

    headers = []
    for w in _WELLS:
        wid, name, field, basin, _county, state, api, lat, lon, kb, td, spud, wtype, status, _q, _n = w
        headers.append([wid, name, field, basin, state, api, lat, lon, kb, td, spud, wtype, status, "app_well"])
    for wid, basin, state, lat, lon, _seed in OFFSETS:
        headers.append([wid, wid.replace("-", " ").title(), "offset", basin, state, "", lat, lon,
                        "", 10000, "", "vertical", "raw", "training_offset"])

    os.makedirs(f"{root}/wells", exist_ok=True)
    with open(f"{root}/wells/well_header.csv", "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["well_id", "well_name", "field_name", "basin", "state", "api_number", "lat", "lon",
                     "kb_elevation_ft", "total_depth_ft", "spud_date", "well_type", "status", "role"])
        wr.writerows(headers)

    # Tops are the zone boundaries the generator draws the rock from.
    os.makedirs(f"{root}/tops", exist_ok=True)
    with open(f"{root}/tops/formation_tops.csv", "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["well_id", "formation_name", "zone_index", "top_md_ft", "base_md_ft", "zone_type"])
        for h in headers:
            for k, z in enumerate(_ZONES):
                wr.writerow([h[0], z[0], k, z[1], z[2], z[13]])

    n = 0
    status = {w[0]: w[13] for w in _WELLS}
    for wid, seed, has_dt, spikes in WELL_LOG_CONFIGS:
        n += write_logs(root, wid, _gen_log_samples(wid, 5000.0, 10000.0, seed, has_dt=has_dt,
                                                    add_spikes=spikes, status=status[wid]))
    for wid, *_rest, seed in OFFSETS:
        n += write_logs(root, wid, _gen_log_samples(wid, 5000.0, 10000.0, seed, has_dt=True,
                                                    add_spikes=random.Random(seed).random() < 0.7,
                                                    status="raw"))
    print(f"wells: {len(headers)}  log samples: {n}  -> {root}")


if __name__ == "__main__":
    main()
