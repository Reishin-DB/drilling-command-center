"""Oilfield Equipment tab API — H2S / sour-service equipment integrity.

Reads each well's H2S profile from Unity Catalog (well_h2s_profile, the same
governed source the Supervisor's HSE gate uses) and runs the deterministic
equipment engine (server/equipment.py) to derive per-component sour-service
impact, cost premium, and lead time.

Demo-safe: if the warehouse is cold or the H2S table is unreachable, falls
back to a small in-module fixture so the tab always renders.
"""
import asyncio
import os
import time

from fastapi import APIRouter

from ..equipment import assess_well, COMPONENTS, GROUP_LABELS

router = APIRouter()

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA  = os.getenv("ADME_SCHEMA", "subsurface_command")

_CACHE: tuple[float, dict] | None = None
_TTL_S = 120

# Demo fallback — a few wells with representative H2S so the tab never blanks.
_FALLBACK_H2S = [
    {"well_id": "EASTTEXAS-05", "well_name": "East Texas 05", "basin": "East Texas",   "h2s_ppm_last_measured": 12000, "sour_classified": True,  "nace_mr0175_required": True},
    {"well_id": "PERMIAN-04",   "well_name": "Permian 04",    "basin": "Permian Basin", "h2s_ppm_last_measured": 44,    "sour_classified": True,  "nace_mr0175_required": True},
    {"well_id": "GREENRIVER-03","well_name": "Green River 03","basin": "Green River",   "h2s_ppm_last_measured": 32.5,  "sour_classified": True,  "nace_mr0175_required": True},
    {"well_id": "PERMIAN-06",   "well_name": "Permian 06",    "basin": "Permian Basin", "h2s_ppm_last_measured": 2.1,   "sour_classified": False, "nace_mr0175_required": False},
    {"well_id": "SANJUAN-01",   "well_name": "San Juan 01",   "basin": "San Juan",     "h2s_ppm_last_measured": 1.2,   "sour_classified": False, "nace_mr0175_required": False},
]


def _run_sql(sql: str):
    """Synchronous warehouse query (mirrors supervisor._run_sql)."""
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    wid = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
    with dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{wid}",
        credentials_provider=lambda: cfg.authenticate,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cols = [d[0].lower() for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]


async def _all_h2s() -> list[dict]:
    """Every well's H2S profile from UC; falls back to the fixture on any error."""
    sql = (
        f"SELECT well_id, well_name, basin, h2s_ppm_last_measured, "
        f"       sour_classified, nace_mr0175_required "
        f"FROM `{CATALOG}`.`{SCHEMA}`.well_h2s_profile"
    )
    try:
        rows = await asyncio.to_thread(_run_sql, sql)
        return rows or _FALLBACK_H2S
    except Exception:
        return _FALLBACK_H2S


@router.get("/equipment/catalog")
async def catalog():
    """Static component catalogue — what the engine reasons over, for the tab's
    'how it works' / methodology panel."""
    return {
        "groups": GROUP_LABELS,
        "components": [
            {"id": c["id"], "group": c["group"], "group_label": GROUP_LABELS[c["group"]],
             "name": c["name"], "baseline": c["baseline"]}
            for c in COMPONENTS
        ],
        "standard": "NACE MR0175 / ISO 15156",
    }


@router.get("/equipment/fleet")
async def fleet():
    """Fleet-wide equipment integrity: one assessment per well, plus rollups
    for the KPI strip (sour wells, total sour-service capex, longest lead)."""
    global _CACHE
    now = time.time()
    if _CACHE and now - _CACHE[0] < _TTL_S:
        return _CACHE[1]

    profiles = await _all_h2s()
    assessments = [assess_well(p.get("well_id"), p) for p in profiles]
    assessments.sort(key=lambda a: a["severity"]["rank"], reverse=True)

    sour = [a for a in assessments if a["severity"]["band"] != "sweet"]
    total_capex = round(sum(a["total_capex_musd"] for a in assessments), 2)
    longest = max((a["critical_path_weeks"] for a in assessments), default=0)
    payload = {
        "wells": assessments,
        "rollup": {
            "well_count": len(assessments),
            "sour_count": len(sour),
            "sour_capex_musd": round(sum(a["total_capex_musd"] for a in sour), 2),
            "total_capex_musd": total_capex,
            "longest_lead_weeks": longest,
            "nace_wells": sum(1 for a in assessments if a["nace_required"]),
        },
        "standard": "NACE MR0175 / ISO 15156",
    }
    _CACHE = (now, payload)
    return payload


@router.get("/equipment/well/{well_id}")
async def well(well_id: str):
    """Per-well equipment integrity assessment (used when a well is selected)."""
    profiles = await _all_h2s()
    match = next((p for p in profiles if str(p.get("well_id")) == well_id), None)
    if not match:
        match = {"well_id": well_id}
    return assess_well(well_id, match)
