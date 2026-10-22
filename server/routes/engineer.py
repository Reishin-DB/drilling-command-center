"""Engineer morning briefing: the operations agent's action items.

The agent works from business context the business owns, not from code:
  business_glossary  what "sour", "audit interval", "days of cover" mean, with thresholds
  engineer_rules     each rule is a read-only SELECT over governed UC tables
Every morning it runs the rules (as the app service principal, read-only),
turns each returned row into an action item with its evidence, the glossary
definition behind it, and links to close it out: the dashboard, the app tab,
the source table in Catalog Explorer, Genie, and a ticket. A short agent note
is written by the model from the items' evidence only, and checked by the same
validator as the decision brief. Tickets and close-outs are written back to UC.
"""
import asyncio
import json
import os
import re
import time
import uuid

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA = os.getenv("ADME_SCHEMA", "subsurface_command")
FQS = f"{CATALOG}.{SCHEMA}"
HOST = (os.getenv("GENIE_HOST") or "https://fevm-oil-pump-monitor.cloud.databricks.com").rstrip("/")
DASHBOARD_URL = os.getenv("SOUR_DASHBOARD_URL", f"{HOST}/dashboardsv3/01f1ce2cf499141a9fc2e28257d500ac/published")
GENIE_SPACE_ID = os.getenv("GENIE_SPACE_ID", "01f17bdeaeee136fbd65013d3eb40261")
FOCUS_WELL = "EASTTEXAS-05"
SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
_NOTE_CACHE: dict[str, tuple[float, dict]] = {}


def _run(statements: list[tuple[str, dict | None]]) -> list[list[dict]]:
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    wh = os.getenv("DATABRICKS_WAREHOUSE_ID", "87e069097741b56c")
    out = []
    with dbsql.connect(server_hostname=host, http_path=f"/sql/1.0/warehouses/{wh}",
                       credentials_provider=lambda: cfg.authenticate) as c, c.cursor() as cur:
        for sql, params in statements:
            cur.execute(sql, params or {})
            try:
                out.append(cur.fetchall_arrow().to_pylist())
            except Exception:
                out.append([])
    return out


def _safe_select(sql: str) -> str:
    """Rules are governed data, but still only ever run as a single read-only SELECT."""
    s = sql.strip().rstrip(";")
    code = re.sub(r"'(?:\\.|[^'\\])*'", "''", s)   # ignore anything inside string literals
    if not re.match(r"(?is)^\s*select\b", code) or ";" in code or re.search(r"(?i)\b(insert|update|delete|merge|drop|alter|create|grant)\b", code):
        raise ValueError("rule check_sql must be a single SELECT")
    return s


def _links(raw: str, rule_id: str, well: str, subject: str) -> list[dict]:
    out = []
    for l in json.loads(raw or "[]"):
        k = l.get("kind")
        if k == "catalog":
            out.append({**l, "url": f"{HOST}/explore/data/{CATALOG}/{SCHEMA}/{l['target']}"})
        elif k == "dashboard":
            out.append({**l, "url": DASHBOARD_URL})
        elif k == "app":
            out.append({**l, "url": f"#{l['target']}?well={well}"})
        else:
            out.append(l)
    out.append({"label": "Ask Genie why", "kind": "genie",
                "question": f"Why is {well} flagged by rule {rule_id} ({subject})? Show the rule, its glossary definition and the data behind it."})
    return out


def _items_sync() -> dict:
    gloss, rules, log, tickets = _run([
        (f"SELECT term, definition, threshold, threshold_value, owner, source FROM {FQS}.business_glossary", None),
        (f"SELECT rule_id, title, glossary_term, severity, owner_role, action, check_sql, links_json FROM {FQS}.engineer_rules", None),
        (f"SELECT item_key, status, at, by, note FROM {FQS}.engineer_action_log QUALIFY row_number() OVER (PARTITION BY item_key ORDER BY at DESC) = 1", None),
        (f"SELECT ticket_id, created_at, created_by, item_key, title, status FROM {FQS}.engineer_tickets ORDER BY created_at", None),
    ])
    g = {x["term"]: x for x in gloss}
    status = {x["item_key"]: x for x in log}
    tix: dict[str, list] = {}
    for t in tickets:
        tix.setdefault(t["item_key"], []).append({**t, "created_at": str(t["created_at"])})
    checks = _run([(_safe_select(r["check_sql"].replace("${schema}", FQS)), None) for r in rules])
    items = []
    for r, rows in zip(rules, checks):
        src = sorted(set(re.findall(rf"{re.escape(FQS)}\.(\w+)", r["check_sql"].replace("${schema}", FQS))))
        for x in rows:
            key = f"{r['rule_id']}|{x['well_id']}|{x['subject']}"
            st = status.get(key)
            items.append({
                "item_key": key, "rule_id": r["rule_id"], "title": r["title"], "severity": r["severity"],
                "owner": r["owner_role"], "action": r["action"], "well_id": x["well_id"], "subject": x["subject"],
                "evidence": x["evidence"], "metric": float(x["metric"]) if x["metric"] is not None else None,
                "threshold": float(x["threshold"]) if x["threshold"] is not None else None,
                "glossary": g.get(r["glossary_term"]), "source_tables": src,
                "links": _links(r["links_json"], r["rule_id"], x["well_id"], x["subject"]),
                "status": st["status"] if st else "open", "closed_by": st["by"] if st else None,
                "tickets": tix.get(key, []),
            })
    items.sort(key=lambda i: (i["well_id"] != FOCUS_WELL, i["status"] != "open", SEV_RANK.get(i["severity"], 9), i["rule_id"]))
    return {"items": items, "rules": len(rules), "glossary_terms": len(gloss)}


async def _agent_note(items: list[dict]) -> dict:
    """A short morning note from the model, using only the focus well's evidence."""
    from server.action_plan import validate
    from server.routes import supervisor as sup
    focus = [i for i in items if i["well_id"] == FOCUS_WELL and i["status"] == "open"]
    if not focus:
        return {"note": f"No open action items on {FOCUS_WELL} this morning.", "validation": None}
    key = "|".join(sorted(i["item_key"] for i in focus))
    hit = _NOTE_CACHE.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    facts = [{"id": f"A{k + 1}", "label": f"{i['title']} ({i['severity']})", "value": i["evidence"]} for k, i in enumerate(focus)]
    msgs = [{"role": "system", "content": (
                "You are Landman Oil's operations agent writing a production engineer's morning note about one well. "
                "Use only the numbered items. Three sentences at most: what needs attention first and why, then what else is waiting. "
                "Cite items like [A1]. Copy figures exactly as written; never round, invent, add up or compute numbers. "
                "Use only the equipment, PPE and terms named in the items (do not substitute, for example, SCBA for EEBA). No headings, no em dashes.")},
            {"role": "user", "content": f"Well {FOCUS_WELL}. Items:\n" + "\n".join(f"[{f['id']}] {f['label']}: {f['value']}" for f in facts)}]
    note, served = "", None
    for ep in sup._fallback_endpoints():
        try:
            r = await asyncio.to_thread(sup._invoke_endpoint, ep, {"messages": msgs, "max_tokens": 400})
            c = (r.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            if isinstance(c, list):
                c = "".join(p.get("text", "") for p in c if isinstance(p, dict))
            if c.strip():
                note, served = c.replace("—", ", ").strip(), ep
                break
        except Exception:
            continue
    check = validate(note, facts) if note else None
    if note and check["unsupported"]:   # one self-correction pass, as in the decision brief
        fix = msgs + [{"role": "assistant", "content": note},
                      {"role": "user", "content": "These figures are not in the items and must not appear: " + ", ".join(check["unsupported"])
                       + ". Rewrite using only figures exactly as written in the items."}]
        try:
            r = await asyncio.to_thread(sup._invoke_endpoint, served, {"messages": fix, "max_tokens": 400})
            c = (r.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            c2 = (c if isinstance(c, str) else "".join(p.get("text", "") for p in c if isinstance(p, dict))).replace("\u2014", ", ").strip()
            if c2 and len(validate(c2, facts)["unsupported"]) <= len(check["unsupported"]):
                note, check = c2, validate(c2, facts)
        except Exception:
            pass
    out = {"note": note or None, "served_by": served, "validation": check, "facts": facts}
    _NOTE_CACHE[key] = (time.time(), out)
    return out


@router.get("/engineer/briefing")
async def briefing():
    data = await asyncio.to_thread(_items_sync)
    items = data["items"]
    focus = [i for i in items if i["well_id"] == FOCUS_WELL]
    data.update({
        "focus_well": FOCUS_WELL,
        "open_focus": sum(1 for i in focus if i["status"] == "open"),
        "open_total": sum(1 for i in items if i["status"] == "open"),
        "other_wells": sorted({i["well_id"] for i in items if i["well_id"] != FOCUS_WELL}),
        "dashboard_url": DASHBOARD_URL,
        "genie_url": f"{HOST}/genie/rooms/{GENIE_SPACE_ID}",
        "agent": await _agent_note(items),
    })
    return data


class TicketReq(BaseModel):
    item_key: str
    rule_id: str
    well_id: str
    title: str
    detail: str = ""


@router.post("/engineer/tickets")
async def create_ticket(req: TicketReq, request: Request):
    who = {k.lower(): v for k, v in request.headers.items()}.get("x-forwarded-email", "engineer")
    tid = "SUB-" + uuid.uuid4().hex[:6].upper()
    await asyncio.to_thread(_run, [(
        f"INSERT INTO {FQS}.engineer_tickets VALUES (:t, current_timestamp(), :who, :k, :r, :w, :title, :d, 'open')",
        {"t": tid, "who": who, "k": req.item_key, "r": req.rule_id, "w": req.well_id, "title": req.title, "d": req.detail})])
    return {"ok": True, "ticket_id": tid, "table": f"{FQS}.engineer_tickets"}


class CloseReq(BaseModel):
    item_key: str
    status: str = "closed"
    note: str = ""


@router.post("/engineer/close")
async def close_item(req: CloseReq, request: Request):
    who = {k.lower(): v for k, v in request.headers.items()}.get("x-forwarded-email", "engineer")
    status = req.status if req.status in ("closed", "open") else "closed"
    await asyncio.to_thread(_run, [(f"INSERT INTO {FQS}.engineer_action_log VALUES (:k, :s, current_timestamp(), :who, :n)",
                                    {"k": req.item_key, "s": status, "who": who, "n": req.note})])
    return {"ok": True, "item_key": req.item_key, "status": status}



@router.get("/engineer/rules")
async def rules():
    """The business context behind the briefing: glossary terms and the governed rule queries."""
    gloss, rs = await asyncio.to_thread(_run, [
        (f"SELECT term, definition, threshold, threshold_value, owner, source FROM {FQS}.business_glossary ORDER BY term", None),
        (f"SELECT rule_id, title, glossary_term, severity, owner_role, action, check_sql FROM {FQS}.engineer_rules ORDER BY rule_id", None)])
    for r in rs:
        r["check_sql"] = r["check_sql"].replace("${schema}", FQS)
    return {"glossary": gloss, "rules": rs, "tables": [f"{FQS}.business_glossary", f"{FQS}.engineer_rules"],
            "catalog_url": f"{HOST}/explore/data/{CATALOG}/{SCHEMA}/business_glossary"}


class ThresholdReq(BaseModel):
    term: str
    threshold_value: float


@router.post("/engineer/glossary")
async def set_threshold(req: ThresholdReq, request: Request):
    """Change a governed threshold. The next briefing re-runs every rule against it."""
    who = {k.lower(): v for k, v in request.headers.items()}.get("x-forwarded-email", "engineer")
    await asyncio.to_thread(_run, [(f"UPDATE {FQS}.business_glossary SET threshold_value = :v WHERE term = :t AND threshold_value IS NOT NULL",
                                    {"v": req.threshold_value, "t": req.term})])
    _NOTE_CACHE.clear()
    return {"ok": True, "term": req.term, "threshold_value": req.threshold_value, "by": who}
