"""Tests for Subsurface Intelligence. Run with: python -m pytest tests (numpy only).

The app's DuckDB store is replaced by an in-memory stub fed by the same seeded
generator the app uses, so the geomodel and economics run without a database.
"""
import asyncio
import importlib
import sys
import types
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.modules.setdefault("duckdb", types.ModuleType("duckdb"))

from server import dcf  # noqa: E402


# ── Repo structure ─────────────────────────────────────────────────────────
@pytest.mark.parametrize("path", ["app.py", "app.yaml", "requirements.txt", "databricks.yml", "server", "frontend",
                                  "pipelines/subsurface_pipeline.py", "ml/train_synthetic_sonic.py", "ml/metrics.json",
                                  "governance/policies.sql", "docs/TALK-TRACK.md"])
def test_paths_exist(path):
    assert (ROOT / path).exists()


# ── One definition of NPV ──────────────────────────────────────────────────
SANJUAN_01 = {"capex_musd": 58.0, "opex_musd_yr": 4.1, "peak_rate_bopd": 1800.0, "decline_pct_yr": 18.0, "wti": 79.18}


def test_npv_matches_uc_function():
    # calculate_npv10 / calculate_break_even on the warehouse returned these for SANJUAN-01 at $79.18.
    assert dcf.npv10(SANJUAN_01) == pytest.approx(92.75, abs=0.01)
    assert dcf.break_even(SANJUAN_01) == pytest.approx(37.44, abs=0.01)


def test_npv_is_zero_at_break_even():
    at_be = {**SANJUAN_01, "wti": dcf.break_even(SANJUAN_01)}
    assert dcf.npv10(at_be) == pytest.approx(0.0, abs=0.05)


@pytest.mark.parametrize("capex,opex,peak,decl", [(65, 4.8, 2100, 15), (72, 5.2, 3200, 28), (58, 4.1, 1800, 18),
                                                   (52, 3.8, 1500, 20), (44, 3.2, 1400, 22), (48, 3.5, 1200, 25)])
def test_irr_found_for_every_fleet_well(capex, opex, peak, decl):
    c = {"capex_musd": capex, "opex_musd_yr": opex, "peak_rate_bopd": peak, "decline_pct_yr": decl, "wti": 79.18}
    r = dcf.irr(c)
    assert r is not None and 0 < r < 1000
    # NPV discounted at the IRR is zero.
    flows = [-capex * 1e6] + dcf._flows(c)
    assert sum(f / (1 + r / 100) ** t for t, f in enumerate(flows)) == pytest.approx(0, abs=5e4)


def test_payback_within_project_life():
    assert 0 < dcf.payback(SANJUAN_01) < dcf.YEARS


# ── Voxel geomodel ─────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def voxels():
    S = importlib.import_module("server.schema")
    wc = ["well_id", "well_name", "field_name", "basin", "county", "state", "api", "lat", "lon", "kb",
          "total_depth_ft", "spud", "well_type", "status", "quality_score", "notes"]
    wells = [dict(zip(wc, w)) for w in S._WELLS]
    tops = [dict(zip(["well_id", "formation_name", "top_md", "base_md", "zone_type", "lith"], t))
            for w in wells for t in S._build_formation_tops(w["well_id"])]
    lc = ["well_id", "md", "gr_raw", "rt_raw", "rxo_raw", "rhob_raw", "nphi_raw", "dt_raw", "cali_raw", "sp_raw", "pef_raw",
          "gr_qc", "rt_qc", "rhob_qc", "nphi_qc", "dt_qc", "gr_c", "rt_c", "rhob_c", "nphi_c", "dt_c", "vcl", "phi_total", "phi_eff", "sw"]
    cfg = [("SANJUAN-01", 42, True, True), ("SANJUAN-02", 77, True, True), ("GREENRIVER-03", 13, False, True),
           ("PERMIAN-04", 99, True, True), ("EASTTEXAS-05", 55, True, False), ("PERMIAN-06", 31, True, True)]
    logs = []
    for wid, seed, has_dt, spikes in cfg:
        st = next(w["status"] for w in wells if w["well_id"] == wid)
        logs += [dict(zip(lc, r)) for r in S._gen_log_samples(wid, 5000.0, 10000.0, seed, has_dt=has_dt, add_spikes=spikes, status=st)]

    class StubDB:
        async def fetch(self, sql, *a):
            if "FROM las.wells" in sql:
                return [dict(w) for w in wells]
            if "formation_tops" in sql:
                return [t for t in tops if t["well_id"] in a]
            return [l for l in logs if l["well_id"] in a]

    V = importlib.import_module("server.voxels")
    V.db = StubDB()
    return V


def test_voxel_model_shape_and_ranges(voxels):
    m = asyncio.run(voxels.build_model("SANJUAN-01"))
    g = m["grid"]
    n = g["nx"] * g["ny"] * g["nz"]
    assert len(m["zone"]) == len(m["phi"]) == len(m["sw"]) == n
    inside = np.array(m["zone"]) >= 0
    assert inside.mean() > 0.9
    phi, sw = np.array(m["phi"])[inside], np.array(m["sw"])[inside]
    assert phi.min() >= 0 and phi.max() <= 0.35
    assert sw.min() >= 0.05 and sw.max() <= 1.0
    assert {w["well_id"] for w in m["wells"]} == {"SANJUAN-01", "SANJUAN-02"}  # same-field AOI only


def test_voxel_model_is_deterministic(voxels):
    voxels._CACHE.clear()
    a = asyncio.run(voxels.build_model("SANJUAN-01"))["sweet_spot"]
    voxels._CACHE.clear()
    b = asyncio.run(voxels.build_model("SANJUAN-01"))["sweet_spot"]
    assert a == b


def test_step_out_respects_ranking_rules(voxels):
    sp = asyncio.run(voxels.build_model("SANJUAN-01"))["sweet_spot"]
    assert 2500 < sp["nearest_well_ft"] < voxels.RANGE_FT
    assert sp["risked_hcpt_ft"] < sp["hcpt_ft"]
    assert 0 <= sp["uncertainty"] <= 1


def test_saturation_height_function():
    from server.voxels import SWIRR, _shf
    assert _shf(-10) == 1.0                      # below the free-water level: water
    assert _shf(0.0) == 1.0
    assert SWIRR < float(_shf(500)) < float(_shf(50)) < 1.0   # drier with height


# ── Engineer rules guard and the grounding validator ──────────────────────
def _load(path, start, end, ns):
    src = (ROOT / path).read_text()
    exec(compile(src[src.index(start):src.index(end)], path, "exec"), ns)
    return ns


def test_rule_sql_guard_allows_select_with_semicolons_in_literals():
    import re
    ns = _load("server/routes/engineer.py", "def _safe_select", "def _links", {"re": re})
    assert ns["_safe_select"]("SELECT concat('a); b', x) FROM t").startswith("SELECT")


@pytest.mark.parametrize("bad", ["DELETE FROM t", "SELECT 1; DROP TABLE t", "SELECT 1 FROM t; DELETE FROM t",
                                 "UPDATE t SET x = 1", "SELECT * FROM t WHERE 1 = 1 GRANT"])
def test_rule_sql_guard_blocks_writes(bad):
    import re
    ns = _load("server/routes/engineer.py", "def _safe_select", "def _links", {"re": re})
    with pytest.raises(ValueError):
        ns["_safe_select"](bad)


def test_validator_ignores_ids_and_catches_invented_figures():
    import re
    ns = _load("server/action_plan.py", "_NUM =", "async def decision_brief", {"re": re})
    facts = [{"id": "A1", "label": "audit", "value": "Last audit 2025-10-01, 386 days ago; 12000.0 ppm"}]
    ok = ns["validate"]("**EASTTEXAS-05** audit is 386 days old at 12000.0 ppm [A1]", facts)
    assert ok["grounded"] and ok["unsupported"] == [] and ok["facts_cited"] == ["A1"]
    bad = ns["validate"]("about 400 days [A1]", facts)
    assert not bad["grounded"] and bad["unsupported"] == ["400"]
