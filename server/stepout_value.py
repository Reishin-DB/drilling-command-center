"""Price the voxel model's proposed step-out.

Screening teams value a step-out by scaling the nearest offset well's type
curve by the ratio of a reservoir-quality measure at the new location to the
offset's. Here that measure is the kriged hydrocarbon pore thickness (HCPT)
from the voxel model, so

    peak_rate_stepout = peak_rate_offset * HCPT_stepout / HCPT_offset

with the offset's capex, opex and decline (same well design, same rock).
The scaled profile is then priced by the certified Unity Catalog functions
calculate_npv10 and calculate_break_even at today's WTI, the same definitions
Genie and the Supervisor use. Both the unrisked (kriged) and the risked
(uncertainty-haircut) HCPT are priced. The offset is priced the same way so
the comparison is like for like.

Absolute in-place volumes are deliberately not used: the synthetic Westwater
is about 1,200 ft thick, so barrels from HCPT x area would be unrealistic,
while the ratio to a producing offset stays meaningful.
"""
import asyncio
import os

from server.db import db
from server.voxels import build_model

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA = os.getenv("ADME_SCHEMA", "subsurface_command")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "87e069097741b56c")
FQS = f"{CATALOG}.{SCHEMA}"
YEARS = 10


def _sql(case: dict) -> str:
    a = f"{case['capex_musd']}, {case['opex_musd_yr']}, {case['peak_rate_bopd']}, {case['decline_pct_yr']}"
    return (f"SELECT round({FQS}.calculate_npv10({a}, {case['wti']}, {YEARS}), 2) AS npv10_musd,\n"
            f"       round({FQS}.calculate_break_even({a}), 2) AS break_even_wti")


def _npv_py(c: dict) -> float:
    """Same formula as the UC function, used only if the warehouse is unreachable."""
    tot = 0.0
    for y in range(YEARS):
        cf = c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 * c["wti"] - c["opex_musd_yr"] * 1e6
        tot += cf / 1.10 ** (y + 1)
    return round(tot / 1e6 - c["capex_musd"], 2)


def _be_py(c: dict) -> float:
    num = c["capex_musd"] * 1e6 + sum(c["opex_musd_yr"] * 1e6 / 1.10 ** (y + 1) for y in range(10))
    den = sum(c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 / 1.10 ** (y + 1) for y in range(10))
    return round(num / den, 2) if den else None


def _irr(c: dict) -> float | None:
    flows = [-c["capex_musd"] * 1e6] + [c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 * c["wti"] - c["opex_musd_yr"] * 1e6 for y in range(YEARS)]
    npv = lambda r: sum(f / (1 + r) ** t for t, f in enumerate(flows))
    lo, hi = -0.9, 5.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(80):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return round(mid * 100, 1)


def _payback(c: dict) -> float | None:
    cum = -c["capex_musd"] * 1e6
    for y in range(YEARS):
        cf = c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 * c["wti"] - c["opex_musd_yr"] * 1e6
        if cum + cf >= 0:
            return round(y + (-cum) / cf, 1) if cf > 0 else None
        cum += cf
    return None


def _price_uc(cases: list[dict]) -> tuple[list[dict], str | None]:
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    out = []
    with dbsql.connect(server_hostname=host, http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
                       credentials_provider=lambda: cfg.authenticate) as conn, conn.cursor() as cur:
        for c in cases:
            cur.execute(_sql(c))
            r = cur.fetchall_arrow().to_pylist()[0]
            out.append({"npv10_musd": float(r["npv10_musd"]), "break_even_wti": float(r["break_even_wti"])})
    return out, None


async def stepout_value(anchor_well: str) -> dict:
    m = await build_model(anchor_well)
    if m.get("error"):
        return {"error": m["error"]}
    sp = m["sweet_spot"]
    near = min(m["wells"], key=lambda w: (w["x"] - sp["x"]) ** 2 + (w["y"] - sp["y"]) ** 2)
    off_hcpt = next((h["hcpt_ft"] for h in m["well_hcpt"] if h["well_id"] == near["well_id"]), None)
    econ = await db.fetchrow(
        "SELECT capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr FROM las.well_economics WHERE well_id=$1",
        near["well_id"])
    price = await db.fetchrow("SELECT price_date, price_usd FROM las.wti_prices ORDER BY price_date DESC LIMIT 1")
    if not econ or not off_hcpt:
        return {"error": f"No economics or HCPT for offset {near['well_id']}"}
    wti = round(float(price["price_usd"]), 2) if price else 70.0

    base = {"capex_musd": float(econ["capex_musd"]), "opex_musd_yr": float(econ["opex_musd_yr"]),
            "decline_pct_yr": float(econ["decline_pct_yr"]), "wti": wti}
    scale = sp["hcpt_ft"] / off_hcpt
    scale_r = sp["risked_hcpt_ft"] / off_hcpt
    cases = {
        "offset":  {**base, "peak_rate_bopd": round(float(econ["peak_rate_bopd"]), 1)},
        "stepout": {**base, "peak_rate_bopd": round(float(econ["peak_rate_bopd"]) * scale, 1)},
        "risked":  {**base, "peak_rate_bopd": round(float(econ["peak_rate_bopd"]) * scale_r, 1)},
    }
    try:
        priced, err = await asyncio.wait_for(asyncio.to_thread(_price_uc, list(cases.values())), timeout=40)
        source = "uc_function"
    except Exception as e:
        priced = [{"npv10_musd": _npv_py(c), "break_even_wti": _be_py(c)} for c in cases.values()]
        source, err = "python_fallback", f"{type(e).__name__}: {str(e)[:160]}"

    out = {}
    for (k, c), p in zip(cases.items(), priced):
        out[k] = {**c, **p, "irr_pct": _irr(c), "payback_years": _payback(c)}
    return {
        "field": m["field"], "basin": m["basin"], "offset_well": near["well_id"],
        "hcpt": {"offset_ft": off_hcpt, "stepout_ft": sp["hcpt_ft"], "risked_ft": sp["risked_hcpt_ft"],
                 "scale": round(scale, 3), "risked_scale": round(scale_r, 3), "uncertainty": sp["uncertainty"]},
        "location": {"lat": sp["lat"], "lon": sp["lon"], "distance_ft": sp["nearest_well_ft"]},
        "wti": wti, "wti_date": price["price_date"].isoformat() if price and price.get("price_date") else None,
        "cases": out,
        "priced_by": source, "pricing_error": err,
        "sql": _sql(cases["stepout"]),
        "method": "Offset type curve scaled by HCPT ratio; capex, opex and decline from the offset; "
                  "priced with the certified UC functions calculate_npv10 and calculate_break_even (10 years, 10% discount). "
                  "IRR and payback computed in the app from the same cash flows.",
    }
