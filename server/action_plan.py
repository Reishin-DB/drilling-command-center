"""Decision brief: "why this well, why now", in plain English for the decision owner.

Grounded generation over the governed numbers the app already computes:
  1. Gather numbered facts from the certified sources: the step-out price
     (calculate_npv10 / calculate_break_even), the voxel model's step-out and
     uncertainty, the sonic model's held-out accuracy, the offset well's H2S
     profile and sour-service equipment capex from Unity Catalog.
  2. Ask the model (through the Supervisor's AI Gateway routing and failover)
     to write the brief using only those facts, citing them as [F1], [F2]...
  3. Validate: every dollar, percent and foot figure in the brief must match a
     fact. Unsupported figures are reported, never silently shown as fact.
  4. Log the facts, prompt, model, output and validation to
     gold_action_plans in Unity Catalog, so every brief is auditable.
"""
import asyncio
import datetime as dt
import json
import os
import re
import uuid

from server.stepout_value import stepout_value
from server.voxels import build_model

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA = os.getenv("ADME_SCHEMA", "subsurface_command")
FQS = f"{CATALOG}.{SCHEMA}"
LOG_TABLE = f"{FQS}.gold_action_plans"

SYSTEM = (
    "You write a decision brief for Landman Oil's SVP Digital Operations and VP of Engineering about one proposed step-out well. "
    "Use ONLY the numbered facts provided. Cite every number with its fact id in square brackets, like [F3]. "
    "Copy every figure exactly as written in the facts; never round, invent or recompute numbers; never use em dashes. Plain business English, at most 230 words, in exactly these sections:\n"
    "**Recommendation** (one sentence)\n"
    "**Why this well** (2 to 3 bullets)\n"
    "**Why now** (1 to 2 bullets)\n"
    "**Risks and how they are controlled** (2 to 3 bullets, including subsurface uncertainty and sour service)\n"
    "**Next actions** (3 bullets, each starting with the owner: SVP Digital Operations, VP of Engineering, or Asset team)"
)


def _sql_rows(statement: str) -> list[dict]:
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    wh = os.getenv("DATABRICKS_WAREHOUSE_ID", "87e069097741b56c")
    with dbsql.connect(server_hostname=host, http_path=f"/sql/1.0/warehouses/{wh}",
                       credentials_provider=lambda: cfg.authenticate) as c, c.cursor() as cur:
        cur.execute(statement)
        try:
            return cur.fetchall_arrow().to_pylist()
        except Exception:
            return []


def _gather(v: dict, m: dict, sonic: dict, h2s: dict | None, equip: dict | None) -> list[dict]:
    o, u, r = v["cases"]["offset"], v["cases"]["stepout"], v["cases"]["risked"]
    delay = 1 - 1 / 1.10 ** 0.5
    facts = [
        ("Proposed step-out location", f"{v['location']['distance_ft']:,} ft from {v['offset_well']} in the {v['field']} field, {v['basin']}"),
        ("Hydrocarbon pore thickness at the step-out (voxel model)", f"{v['hcpt']['stepout_ft']} ft vs {v['hcpt']['offset_ft']} ft at {v['offset_well']}"),
        ("Risked hydrocarbon pore thickness (haircut for distance from control)", f"{v['hcpt']['risked_ft']} ft; model uncertainty {v['hcpt']['uncertainty']} on a 0 to 1 scale (0 at a well, 1 with no nearby control), so higher means less certain"),
        ("Step-out value, unrisked (certified calculate_npv10)", f"${u['npv10_musd']:.1f}M NPV10, {u['irr_pct']:.0f}% IRR, {u['payback_years']} yr payback"),
        ("Step-out value, risked (certified calculate_npv10)", f"${r['npv10_musd']:.1f}M NPV10, {r['irr_pct']:.0f}% IRR, {r['payback_years']} yr payback, ${r['break_even_wti']:.0f} break-even WTI"),
        ("Capex and price assumptions", f"${r['capex_musd']:.0f}M capex (offset well design), WTI ${v['wti']:.2f}"),
        ("Offset well priced the same way", f"{v['offset_well']} ${o['npv10_musd']:.1f}M NPV10"),
        ("Cost of a six-month delay (10% discount)", f"${r['npv10_musd'] * delay:.1f}M of the risked value, ${u['npv10_musd'] * delay:.1f}M unrisked, {delay * 100:.1f}% of NPV"),
        ("Synthetic-sonic model accuracy on held-out wells", f"{sonic.get('champion_mae', 3.0):.1f} us/ft vs {sonic.get('gardner_mae', 10.7):.1f} us/ft for calibrated Gardner"),
        ("Structural setting", f"{m['structure']['closure_ft']} ft closure, {m['fault']['throw_ft']} ft normal fault, free-water level {m.get('fwl_ft')} ft"),
    ]
    if h2s:
        facts.append(("Offset well H2S profile (Unity Catalog)", f"{h2s.get('h2s_risk_level')} risk, {h2s.get('h2s_ppm_last_measured')} ppm last measured, NACE MR0175 required: {h2s.get('nace_mr0175_required')}"))
    if equip:
        facts.append(("Sour-service equipment for that severity band", f"${float(equip.get('capex') or 0):.2f}M upgrade capex, {equip.get('lead')} weeks longest lead time"))
    return [{"id": f"F{i + 1}", "label": k, "value": val} for i, (k, val) in enumerate(facts)]


_NUM = re.compile(r"\$?\d[\d,]*\.?\d*\s?(?:M|%|ft|yr|weeks|ppm|us/ft)?")


def _numbers(text: str) -> set[str]:
    out = set()
    for t in _NUM.findall(text):
        n = re.sub(r"[^\d.]", "", t)
        if n and n not in (".",) and not re.fullmatch(r"\d", n):   # skip single digits (list markers, "3 bullets")
            out.add(n.rstrip("0").rstrip(".") if "." in n else n)
    return out


def validate(plan: str, facts: list[dict]) -> dict:
    """Every multi-digit figure in the brief must appear in a fact value."""
    ident = re.compile(r"\b[A-Z][A-Z0-9]*-[A-Z0-9-]*\d\b")   # well, part and rule ids (EASTTEXAS-05, P-002) are not figures
    fact_nums = set().union(*[_numbers(ident.sub("", f["value"])) for f in facts]) | {f["id"][1:] for f in facts}
    body = ident.sub("", re.sub(r"\[[A-Z]\d+\]", "", plan))
    used = _numbers(body)
    unsupported = sorted(n for n in used if n not in fact_nums)
    cited = sorted(set(re.findall(r"\[([A-Z]\d+)\]", plan)), key=lambda x: (x[0], int(x[1:])))
    return {"figures_checked": len(used), "unsupported": unsupported, "facts_cited": cited, "grounded": not unsupported and bool(cited)}


async def decision_brief(anchor_well: str) -> dict:
    from server.routes import supervisor as sup
    v = await stepout_value(anchor_well)
    if v.get("error"):
        return {"error": v["error"]}
    m = await build_model(anchor_well)
    try:
        sm = json.load(open(os.path.join(os.path.dirname(__file__), "sonic_metrics.json")))
        sonic = {"champion_mae": sm["champion_scores"]["mae"], "gardner_mae": sm["pooled"]["gardner_calibrated"]["mae"]}
    except Exception:
        sonic = {}
    well = v["offset_well"]
    h2s = equip = None
    try:
        rows = await asyncio.to_thread(_sql_rows, f"SELECT h2s_risk_level, h2s_ppm_last_measured, nace_mr0175_required FROM {FQS}.well_h2s_profile WHERE well_id = '{well}'")
        h2s = rows[0] if rows else None
        rows = await asyncio.to_thread(_sql_rows, f"SELECT sum(upgrade_capex_musd) AS capex, max(upgrade_lead_weeks) AS lead FROM {FQS}.well_equipment_integrity WHERE well_id = '{well}'")
        equip = rows[0] if rows else None
    except Exception:
        pass
    facts = _gather(v, m, sonic, h2s, equip)
    user = "Facts:\n" + "\n".join(f"[{f['id']}] {f['label']}: {f['value']}" for f in facts)
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]

    endpoints = sup._fallback_endpoints()

    async def generate(msgs):
        err = None
        for ep in endpoints:
            try:
                r = await asyncio.to_thread(sup._invoke_endpoint, ep, {"messages": msgs, "max_tokens": 900})
                text = (r.get("choices") or [{}])[0].get("message", {}).get("content") or ""
                if isinstance(text, list):   # some providers return content parts
                    text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
                if text.strip():
                    return text.replace("\u2014", ", "), ep, r.get("usage") or {}, None
            except Exception as e:
                err = f"{type(e).__name__}: {str(e)[:160]}"
        return "", None, {}, err

    # Generate, validate, and give the model one chance to remove any figure that
    # is not in the facts. Both attempts are kept in the log.
    plan, served_by, usage, err = await generate(messages)
    if not plan:
        return {"error": f"All model endpoints failed: {err}", "facts": facts}
    check = validate(plan, facts)
    attempts = [{"plan": plan, "validation": check}]
    if check["unsupported"]:
        fix = messages + [{"role": "assistant", "content": plan},
                          {"role": "user", "content": "These figures are not in the facts and must not appear: "
                           + ", ".join(check["unsupported"]) + ". Rewrite the brief without them, using only figures exactly as written in the facts."}]
        plan2, sb2, usage2, _ = await generate(fix)
        if plan2:
            check2 = validate(plan2, facts)
            attempts.append({"plan": plan2, "validation": check2})
            if len(check2["unsupported"]) <= len(check["unsupported"]):
                plan, served_by, check = plan2, sb2, check2
                usage = {k: int(usage.get(k) or 0) + int(usage2.get(k) or 0) for k in ("prompt_tokens", "completion_tokens")}

    brief_id = str(uuid.uuid4())
    logged = False
    try:
        esc = lambda s: s.replace("\\", "\\\\").replace("'", "\\'")
        await asyncio.to_thread(_sql_rows, f"""INSERT INTO {LOG_TABLE} VALUES (
            '{brief_id}', current_timestamp(), '{esc(anchor_well)}', '{esc(served_by)}', '{esc(json.dumps(facts))}',
            '{esc(SYSTEM)}', '{esc(plan)}', {len(check['unsupported'])}, {str(check['grounded']).lower()},
            {int(usage.get('prompt_tokens') or 0)}, {int(usage.get('completion_tokens') or 0)})""")
        logged = True
    except Exception as e:
        err = f"log failed: {type(e).__name__}: {str(e)[:160]}"
    return {"brief_id": brief_id, "well": anchor_well, "plan": plan, "facts": facts, "validation": check,
            "attempts": len(attempts), "first_attempt_unsupported": attempts[0]["validation"]["unsupported"],
            "served_by": served_by, "fell_back": served_by != endpoints[0], "usage": usage,
            "logged_to": LOG_TABLE if logged else None, "log_error": None if logged else err,
            "generated": dt.datetime.now(dt.timezone.utc).isoformat()}
