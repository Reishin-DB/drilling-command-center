"""Expert Agent — Claude Sonnet with tool-calling across Vector Search,
UC Functions, Genie, and local well context. MLflow tracing optional."""
from __future__ import annotations

import asyncio
import json
import os
import time
import traceback
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..db import db

router = APIRouter()

CATALOG = os.getenv("ADME_CATALOG", "adme_adb_sbx_scus_dbx_ws_1")
SCHEMA  = os.getenv("ADME_SCHEMA", "adme_client_demo")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "186af4be97756033")
VS_ENDPOINT = os.getenv("VS_ENDPOINT", "subsurface-vs")
VS_INDEX    = os.getenv("VS_INDEX",    f"{CATALOG}.{SCHEMA}.wellbore_vs_index")
MODEL_ENDPOINT = os.getenv("AGENT_MODEL", "databricks-claude-sonnet-4-5")

# Optional MLflow tracing
try:
    import mlflow
    from mlflow.tracing import set_span_status
    _MLFLOW = True
except Exception:
    _MLFLOW = False


SYSTEM = """You are the Subsurface Intelligence Expert Agent — a senior upstream O&G petrotech analyst backed by Databricks tools.

You have these tools available:
- get_well_context: load formation, QC, anomaly, economics for a specific well_id from local DuckDB.
- search_similar_wells: semantic Vector Search over live OSDU wellbore metadata; use to find analog wells.
- calculate_npv: Unity Catalog Function, NPV₁₀ in $M given capex, opex, rate, decline, wti, years.
- calculate_break_even: UC Function, break-even WTI $/bbl.
- forecast_decline_curve: UC Function, Arps decline forecast, returns [year, rate_bopd] pairs.

Rules:
- Use tools whenever a user question needs data you don't have in the message.
- Always cite the specific well_id / values you used.
- Keep answers crisp. Lead with the recommendation, then supporting numbers.
- If a tool errors, report it and fall back to reasoning from what you have.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_well_context",
            "description": "Return a text block with well metadata, formations, QC scores, and anomalies for a well_id.",
            "parameters": {
                "type": "object",
                "properties": {"well_id": {"type": "string"}},
                "required": ["well_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_similar_wells",
            "description": "Semantic Vector Search across OSDU wellbore records. Returns top-k similar wells to the query.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query_text": {"type": "string"},
                    "k":          {"type": "integer", "default": 5},
                },
                "required": ["query_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_npv",
            "description": "NPV at 10% discount in $M for a decline-curve well. Uses Unity Catalog function.",
            "parameters": {
                "type": "object",
                "properties": {
                    "capex_musd":     {"type": "number"},
                    "opex_musd_yr":   {"type": "number"},
                    "peak_rate_bopd": {"type": "number"},
                    "decline_pct_yr": {"type": "number"},
                    "wti_price":      {"type": "number"},
                    "years":          {"type": "integer", "default": 10},
                },
                "required": ["capex_musd", "opex_musd_yr", "peak_rate_bopd", "decline_pct_yr", "wti_price"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_break_even",
            "description": "Break-even WTI $/bbl at which NPV10 = 0. Uses Unity Catalog function.",
            "parameters": {
                "type": "object",
                "properties": {
                    "capex_musd":     {"type": "number"},
                    "opex_musd_yr":   {"type": "number"},
                    "peak_rate_bopd": {"type": "number"},
                    "decline_pct_yr": {"type": "number"},
                },
                "required": ["capex_musd", "opex_musd_yr", "peak_rate_bopd", "decline_pct_yr"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forecast_decline_curve",
            "description": "Arps hyperbolic decline forecast. Returns [year, rate_bopd] pairs as JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "peak_rate_bopd": {"type": "number"},
                    "decline_pct_yr": {"type": "number"},
                    "b_factor":       {"type": "number", "default": 0.5},
                    "years":          {"type": "integer", "default": 10},
                },
                "required": ["peak_rate_bopd", "decline_pct_yr"],
            },
        },
    },
]


# ─────────── Tool implementations ─────────────────────────────────────────


def _sql_conn():
    from databricks import sql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    return sql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
    )


async def tool_get_well_context(well_id: str) -> str:
    well = await db.fetchrow(
        "SELECT well_id, well_name, basin, state, status, quality_score, total_depth_ft, well_type, notes "
        "FROM las.wells WHERE well_id = $1", well_id
    )
    if not well:
        return f"No well {well_id} in catalog"
    fmt = await db.fetch(
        "SELECT formation_name, top_md, base_md, zone_type FROM las.formation_tops WHERE well_id=$1 ORDER BY top_md", well_id
    )
    cq = await db.fetch(
        "SELECT curve_name, coverage_pct, spike_count, gap_count, quality_score "
        "FROM las.curve_quality WHERE well_id=$1", well_id
    )
    anom = await db.fetch(
        "SELECT curve_name, depth_start, depth_end, severity, description FROM las.anomalies WHERE well_id=$1", well_id
    )
    econ = await db.fetchrow(
        "SELECT capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr, wti_break_even, npv10_musd, irr_pct "
        "FROM las.well_economics WHERE well_id=$1", well_id
    )
    lines = [f"WELL {well['well_id']} — {well['well_name']}"]
    lines.append(f"  basin={well.get('basin')} | status={well.get('status')} | quality={well.get('quality_score')}/100 | TD={well.get('total_depth_ft')} ft | type={well.get('well_type')}")
    if well.get("notes"):
        lines.append(f"  notes: {well['notes']}")
    if econ:
        lines.append(f"  economics: capex=${econ['capex_musd']}M opex=${econ['opex_musd_yr']}M/yr peak={econ['peak_rate_bopd']} bopd decline={econ['decline_pct_yr']}% BE=${econ['wti_break_even']}/bbl NPV10=${econ['npv10_musd']}M IRR={econ['irr_pct']}%")
    if fmt:
        lines.append("  formations:")
        for f in fmt:
            lines.append(f"    {f['formation_name']}: {f['top_md']}-{f['base_md']} ft [{f['zone_type']}]")
    if cq:
        lines.append("  curve quality:")
        for c in cq:
            lines.append(f"    {c['curve_name']}: cov={c['coverage_pct']}% spikes={c['spike_count']} gaps={c['gap_count']} score={c['quality_score']}/100")
    if anom:
        lines.append("  anomalies:")
        for a in anom:
            lines.append(f"    [{a['severity']}] {a['curve_name']} {a['depth_start']}-{a['depth_end']} ft: {a['description']}")
    return "\n".join(lines)


def _vs_search_sync(query_text: str, k: int) -> list[dict]:
    from databricks.vector_search.client import VectorSearchClient
    c = VectorSearchClient(disable_notice=True)
    idx = c.get_index(endpoint_name=VS_ENDPOINT, index_name=VS_INDEX)
    res = idx.similarity_search(
        query_text=query_text,
        columns=["well_key", "well_name", "platform", "primary_reservoir", "drilling_result"],
        num_results=k,
    )
    rows = []
    if res and "result" in res:
        data = res["result"].get("data_array", [])
        cols = [c["name"] for c in res["manifest"]["columns"]]
        for r in data:
            rows.append(dict(zip(cols, r)))
    return rows


async def tool_search_similar_wells(query_text: str, k: int = 5) -> str:
    try:
        rows = await asyncio.to_thread(_vs_search_sync, query_text, int(k))
    except Exception as e:
        return f"Vector Search error: {e}"
    if not rows:
        return "No results."
    out = [f"Top {len(rows)} similar wells for: {query_text!r}"]
    for r in rows:
        out.append(f"  - {r.get('well_key','?')[:40]} | {r.get('well_name','')} | platform={r.get('platform','')} | reservoir={r.get('primary_reservoir','')} | result={r.get('drilling_result','')} | score={r.get('score',0):.3f}")
    return "\n".join(out)


def _uc_function_sync(fn_sql: str, params: list) -> Any:
    with _sql_conn() as c, c.cursor() as cur:
        placeholders = ",".join(["?"] * len(params))
        cur.execute(f"SELECT {CATALOG}.{SCHEMA}.{fn_sql}({placeholders}) AS r", params)
        row = cur.fetchall_arrow().to_pylist()
        return row[0].get("r") if row else None


async def tool_calculate_npv(capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr, wti_price, years=10):
    try:
        r = await asyncio.to_thread(_uc_function_sync, "calculate_npv10",
                                    [capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr, wti_price, int(years)])
        return f"calculate_npv10 → ${r}M (capex ${capex_musd}M · opex ${opex_musd_yr}M/yr · peak {peak_rate_bopd} bopd · decline {decline_pct_yr}% · WTI ${wti_price} · {years}yr)"
    except Exception as e:
        return f"calculate_npv error: {e}"


async def tool_calculate_break_even(capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr):
    try:
        r = await asyncio.to_thread(_uc_function_sync, "calculate_break_even",
                                    [capex_musd, opex_musd_yr, peak_rate_bopd, decline_pct_yr])
        return f"break-even WTI = ${r}/bbl (capex ${capex_musd}M · opex ${opex_musd_yr}M/yr · peak {peak_rate_bopd} bopd · decline {decline_pct_yr}%)"
    except Exception as e:
        return f"calculate_break_even error: {e}"


async def tool_forecast_decline(peak_rate_bopd, decline_pct_yr, b_factor=0.5, years=10):
    try:
        r = await asyncio.to_thread(_uc_function_sync, "forecast_decline_curve",
                                    [peak_rate_bopd, decline_pct_yr, b_factor, int(years)])
        return f"Arps decline (b={b_factor}): {r}"
    except Exception as e:
        return f"forecast_decline error: {e}"


TOOL_IMPL = {
    "get_well_context":     lambda a: tool_get_well_context(a.get("well_id")),
    "search_similar_wells": lambda a: tool_search_similar_wells(a.get("query_text", ""), a.get("k", 5)),
    "calculate_npv":        lambda a: tool_calculate_npv(
        a.get("capex_musd"), a.get("opex_musd_yr"), a.get("peak_rate_bopd"),
        a.get("decline_pct_yr"), a.get("wti_price"), a.get("years", 10)),
    "calculate_break_even": lambda a: tool_calculate_break_even(
        a.get("capex_musd"), a.get("opex_musd_yr"),
        a.get("peak_rate_bopd"), a.get("decline_pct_yr")),
    "forecast_decline_curve": lambda a: tool_forecast_decline(
        a.get("peak_rate_bopd"), a.get("decline_pct_yr"),
        a.get("b_factor", 0.5), a.get("years", 10)),
}


# ─────────── Chat loop ─────────────────────────────────────────────────────


class ChatReq(BaseModel):
    question: str
    well_id: str | None = None
    history: list = []


def _openai_call(messages: list, tools: list) -> Any:
    """Call Databricks-hosted Claude via OpenAI-compatible API."""
    from databricks.sdk import WorkspaceClient
    w = WorkspaceClient()
    # Use raw HTTP since serving_endpoints.query typed signature doesn't map clean to tools
    import urllib.request
    import urllib.parse
    host = (os.getenv("DATABRICKS_HOST") or w.config.host or "").rstrip("/")
    token = w.config.authenticate().get("Authorization", "").replace("Bearer ", "")
    url = f"{host}/serving-endpoints/{MODEL_ENDPOINT}/invocations"
    body = json.dumps({
        "messages": messages,
        "tools":    tools,
        "max_tokens": 1024,
        "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read())


@router.post("/agent/chat")
async def chat(req: ChatReq):
    start = time.time()
    trace: list[dict] = []

    messages: list[dict] = [{"role": "system", "content": SYSTEM}]
    for m in (req.history or [])[-6:]:
        if m.get("role") in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m.get("content", "")})
    user_msg = req.question
    if req.well_id:
        user_msg = f"[active well: {req.well_id}]\n{user_msg}"
    messages.append({"role": "user", "content": user_msg})

    final_text = ""
    try:
        for loop in range(6):
            resp = await asyncio.to_thread(_openai_call, messages, TOOLS)
            choice = resp["choices"][0]
            msg = choice.get("message", {})
            messages.append(msg)
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                final_text = msg.get("content", "") or ""
                break
            # Execute each tool call
            for tc in tool_calls:
                fn = tc["function"]["name"]
                args_raw = tc["function"].get("arguments", "{}")
                try:
                    args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
                except Exception:
                    args = {}
                t0 = time.time()
                impl = TOOL_IMPL.get(fn)
                if not impl:
                    result = f"unknown tool {fn}"
                else:
                    try:
                        result = await impl(args)
                    except Exception as e:
                        result = f"tool {fn} failed: {e}"
                dur = round((time.time() - t0) * 1000)
                trace.append({"tool": fn, "args": args, "result_preview": str(result)[:400], "ms": dur})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", ""),
                    "content": str(result),
                })
    except Exception as e:
        return {"error": str(e), "trace_debug": traceback.format_exc()[-400:], "trace": trace}

    return {
        "answer":  final_text,
        "well_id": req.well_id,
        "trace":   trace,
        "latency_ms": round((time.time() - start) * 1000),
    }


@router.get("/agent/tools")
async def list_tools():
    return [{"name": t["function"]["name"], "description": t["function"]["description"]} for t in TOOLS]
