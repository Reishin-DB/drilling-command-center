"""Synthetic sonic: the served model fills a missing DT curve, Gardner is the fallback.

GET /api/sonic/metrics      leave-one-well-out evaluation of the champion (server/sonic_metrics.json,
                            written from the training run's gold_sonic_model_metrics)
GET /api/sonic/{well_id}    per-sample model vs Gardner vs measured DT for one well

The model is the UC champion behind the `subsurface-synthetic-sonic` endpoint
(ml/train_synthetic_sonic.py). It is called with the app's service principal;
if the endpoint is cold, missing, or slow, the route answers with Gardner and
says so (source = "gardner").
"""
import asyncio
import json
import math
import os

from fastapi import APIRouter

from ..db import db
from ..schema import _ZONES, _get_zone

router = APIRouter()

ENDPOINT = os.environ.get("SONIC_ENDPOINT", "subsurface-synthetic-sonic")
TIMEOUT_S = float(os.environ.get("SONIC_TIMEOUT_S", "8"))
FEATURES = ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"]
ZIDX = {z[0]: k for k, z in enumerate(_ZONES)}
_METRICS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sonic_metrics.json")


def _metrics() -> dict:
    try:
        with open(_METRICS_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def gardner(rhob):
    """Gardner (1974): rho = 0.23 V^0.25 with V in ft/s, so DT = 1e6 / (rho/0.23)^4."""
    return None if not rhob else round(1e6 / (rhob / 0.23) ** 4, 2)


def _query_endpoint(rows: list) -> list:
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.serving import DataframeSplitInput
    w = WorkspaceClient()
    r = w.serving_endpoints.query(name=ENDPOINT, dataframe_split=DataframeSplitInput(
        columns=FEATURES, data=[[x[c] for c in FEATURES] for x in rows]))
    return [round(float(p), 2) for p in r.predictions]


@router.get("/sonic/metrics")
async def sonic_metrics():
    return {"endpoint": ENDPOINT, **_metrics()}


@router.get("/sonic/{well_id}")
async def sonic(well_id: str, target_rows: int = 500):
    logs = await db.fetch(
        "SELECT md, COALESCE(gr_c, gr_raw) AS gr, COALESCE(rt_c, rt_raw) AS rt, "
        "COALESCE(rhob_c, rhob_raw) AS rhob, COALESCE(nphi_c, nphi_raw) AS nphi, dt_raw, "
        "gr_qc, rt_qc, rhob_qc, nphi_qc, dt_qc "
        "FROM las.depth_logs WHERE well_id = $1 ORDER BY md", well_id)
    if not logs:
        return {"well_id": well_id, "error": "no logs"}
    step = max(1, len(logs) // max(1, target_rows))
    rows = []
    for r in logs[::step]:
        clean = all(not r[k] for k in ("gr_qc", "rt_qc", "rhob_qc", "nphi_qc"))
        rows.append({
            "md": r["md"], "gr": r["gr"], "rhob": r["rhob"], "nphi": r["nphi"], "rt": r["rt"],
            "dt_actual": r["dt_raw"] if not r["dt_qc"] else None,
            "dt_gardner": gardner(r["rhob"]),
            "_ok": clean and None not in (r["gr"], r["rhob"], r["nphi"], r["rt"]) and (r["rt"] or 0) > 0,
        })
    inputs = [{"gr_api": x["gr"], "rhob_gcc": x["rhob"], "nphi_vv": x["nphi"],
               "log_rt": math.log10(x["rt"]), "md_ft": x["md"], "zone_index": ZIDX[_get_zone(x["md"])[0]]}
              for x in rows if x["_ok"]]
    source, error = "model", None
    try:
        preds = await asyncio.wait_for(asyncio.to_thread(_query_endpoint, inputs), timeout=TIMEOUT_S)
    except Exception as e:  # cold start, missing grant, timeout: fall back, and say so
        source, error, preds = "gardner", f"{type(e).__name__}: {str(e)[:160]}", None
    it = iter(preds or [])
    for x in rows:
        x["dt_model"] = next(it) if (preds and x.pop("_ok")) else None
        x.pop("_ok", None)
    measured = [x for x in rows if x["dt_actual"] is not None and x["dt_model"] is not None]
    fit = None
    if measured:
        mae = lambda k: round(sum(abs(x[k] - x["dt_actual"]) for x in measured) / len(measured), 2)  # noqa: E731
        fit = {"n": len(measured), "model_mae": mae("dt_model"), "gardner_mae": mae("dt_gardner")}
    return {
        "well_id": well_id, "source": source, "endpoint": ENDPOINT, "error": error,
        "has_measured_dt": any(x["dt_actual"] is not None for x in rows),
        "this_well": fit, "metrics": _metrics(), "rows": rows,
    }
