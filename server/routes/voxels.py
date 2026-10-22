from fastapi import APIRouter

from server.db import db
from server.stepout_value import stepout_value
from server.voxels import build_model

router = APIRouter()


@router.get("/voxels/stepouts")
async def stepouts():
    """The voxel model's proposed step-out for every field, for the map."""
    wells = await db.fetch("SELECT well_id FROM las.wells WHERE well_id NOT LIKE 'OSDU-%' AND lat IS NOT NULL ORDER BY well_id")
    out, seen = [], set()
    for w in wells:
        m = await build_model(w["well_id"])
        if m.get("error"):
            continue
        key = tuple(sorted(x["well_id"] for x in m["wells"]))
        if key in seen:
            continue
        seen.add(key)
        sp = m["sweet_spot"]
        nearest = min(m["wells"], key=lambda x: (x["x"] - sp["x"]) ** 2 + (x["y"] - sp["y"]) ** 2)
        out.append({
            "field": m["field"], "basin": m["basin"], "anchor_well": w["well_id"],
            "nearest_well": nearest["well_id"], "control_wells": [x["well_id"] for x in m["wells"]],
            **{k: sp[k] for k in ("lat", "lon", "hcpt_ft", "risked_hcpt_ft", "control_mean_hcpt_ft", "nearest_well_ft", "uncertainty")},
        })
    return {"stepouts": out}


@router.get("/voxels/stepout_value/{well_id}")
async def value_stepout(well_id: str):
    """Price the proposed step-out for the anchor well's field."""
    return await stepout_value(well_id)


@router.get("/voxels/{well_id}")
async def voxel_model(well_id: str):
    """Voxel property model for the anchor well's field (cached per set of wells)."""
    return await build_model(well_id)


@router.post("/voxels/decision_brief/{well_id}")
async def brief(well_id: str):
    """Plain-English 'why this well, why now' brief, grounded in governed facts and logged to UC."""
    from server.action_plan import decision_brief
    return await decision_brief(well_id)
