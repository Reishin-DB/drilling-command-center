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
(uncertainty-haircut) HCPT are priced. The offset is priced the same way, which
is the same price the portfolio table shows for it (server/dcf.py).

Absolute in-place volumes are deliberately not used: the synthetic Westwater
is about 1,200 ft thick, so barrels from HCPT x area would be unrealistic,
while the ratio to a producing offset stays meaningful.
"""
import asyncio

from server.db import db
from server.voxels import build_model

from server import dcf


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
        priced, source, err = await asyncio.wait_for(asyncio.to_thread(dcf.price, list(cases.values())), timeout=40)
    except asyncio.TimeoutError:
        priced = [{"npv10_musd": dcf.npv10(c), "break_even_wti": dcf.break_even(c), "irr_pct": dcf.irr(c),
                   "payback_years": dcf.payback(c)} for c in cases.values()]
        source, err = "python_fallback", "warehouse timed out"
    out = {k: {**c, **p} for (k, c), p in zip(cases.items(), priced)}
    return {
        "field": m["field"], "basin": m["basin"], "offset_well": near["well_id"],
        "hcpt": {"offset_ft": off_hcpt, "stepout_ft": sp["hcpt_ft"], "risked_ft": sp["risked_hcpt_ft"],
                 "scale": round(scale, 3), "risked_scale": round(scale_r, 3), "uncertainty": sp["uncertainty"]},
        "location": {"lat": sp["lat"], "lon": sp["lon"], "distance_ft": sp["nearest_well_ft"]},
        "wti": wti, "wti_date": price["price_date"].isoformat() if price and price.get("price_date") else None,
        "cases": out,
        "priced_by": source, "pricing_error": err,
        "sql": dcf.sql_for(cases["stepout"]),
        "method": "Offset type curve scaled by HCPT ratio; capex, opex and decline from the offset; "
                  "priced with the certified UC functions calculate_npv10 and calculate_break_even (10 years, 10% discount). "
                  "IRR and payback computed in the app from the same cash flows.",
    }
