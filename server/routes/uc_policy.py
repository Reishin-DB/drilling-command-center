"""Live Unity Catalog policy demo for the Governance tab.

Runs the same query against gold_zone_summary twice: as the app service
principal (operator view) and as the signed-in user via their forwarded OBO
token. The row filter (basin_filter) and column mask (mask_interpretation) are
enforced by Unity Catalog on the caller's identity, so mapping the user as a
JV partner in access_personas changes what *they* see, in the app, in Genie,
and in the SQL editor alike.
"""
import asyncio
import os
import re

from fastapi import APIRouter, Request

router = APIRouter()

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA = os.getenv("ADME_SCHEMA", "subsurface_command")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "87e069097741b56c")
FQS = f"`{CATALOG}`.`{SCHEMA}`"
PARTNER_BASIN = "San Juan"

QUERY = (
    f"SELECT basin, count(*) AS zone_rows, count(avg_pay_sw) AS sw_visible, count(hc_pore_ft) AS hc_pore_visible,\n"
    f"       round(sum(net_pay_ft)) AS net_pay_ft\n"
    f"FROM {CATALOG}.{SCHEMA}.gold_zone_summary\n"
    f"GROUP BY basin ORDER BY basin"
)
EQUIP = (
    f"SELECT 'Equipment integrity' AS object, count(*) AS rows_, count(h2s_ppm) AS h2s_visible, count(upgrade_capex_musd) AS capex_visible, "
    f"count(risk_score) AS interp_visible FROM {CATALOG}.{SCHEMA}.well_equipment_integrity "
    f"UNION ALL SELECT 'H2S profile', count(*), count(h2s_ppm_last_measured), NULL, count(notes) FROM {CATALOG}.{SCHEMA}.well_h2s_profile"
)
WHO = f"SELECT current_user() AS principal, {FQS}.is_jv_partner() AS jv_partner"
POLICY_SQL = (
    f"ALTER TABLE {CATALOG}.{SCHEMA}.gold_zone_summary\n"
    f"  SET ROW FILTER {CATALOG}.{SCHEMA}.basin_filter ON (basin);\n"
    f"ALTER TABLE {CATALOG}.{SCHEMA}.gold_zone_summary\n"
    f"  ALTER COLUMN avg_pay_sw SET MASK {CATALOG}.{SCHEMA}.mask_interpretation;\n"
    f"ALTER TABLE {CATALOG}.{SCHEMA}.gold_zone_summary\n"
    f"  ALTER COLUMN hc_pore_ft SET MASK {CATALOG}.{SCHEMA}.mask_interpretation;"
)
EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$")


def _run(statements: list[tuple[str, dict | None]], token: str | None = None) -> list[list[dict]]:
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    kw = {"access_token": token} if token else {"credentials_provider": lambda: cfg.authenticate}
    out = []
    with dbsql.connect(server_hostname=host, http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}", **kw) as c, c.cursor() as cur:
        for sql, params in statements:
            cur.execute(sql, params or {})
            try:
                out.append(cur.fetchall_arrow().to_pylist())
            except Exception:
                out.append([])
    return out


def _run_rest(statements: list[str], token: str) -> list[list[dict]]:
    """Run as the signed-in user through the SQL Statement Execution API with
    their forwarded OBO token (clear errors, no connector session to set up)."""
    import httpx
    from databricks.sdk.core import Config
    host = (os.getenv("DATABRICKS_HOST") or Config().host or "").rstrip("/")
    if not host.startswith("http"):
        host = "https://" + host
    out = []
    with httpx.Client(timeout=60) as c:
        for sql in statements:
            r = c.post(f"{host}/api/2.0/sql/statements", headers={"Authorization": f"Bearer {token}"},
                       json={"warehouse_id": WAREHOUSE_ID, "statement": sql, "wait_timeout": "50s"})
            try:
                d = r.json()
            except ValueError:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
            if r.status_code != 200 or d.get("status", {}).get("state") != "SUCCEEDED":
                raise RuntimeError(f"HTTP {r.status_code}: {(d.get('status', {}).get('error') or d).get('message', d) if isinstance(d, dict) else d}")
            cols = [c_["name"] for c_ in d["manifest"]["schema"]["columns"]]
            types = [c_["type_name"] for c_ in d["manifest"]["schema"]["columns"]]
            conv = lambda v, t: None if v is None else (v.lower() == "true" if t == "BOOLEAN" else float(v) if t in ("DOUBLE", "DECIMAL", "FLOAT") else int(v) if t in ("LONG", "INT", "BIGINT", "SHORT") else v)
            out.append([{k: conv(v, t) for k, v, t in zip(cols, row, types)} for row in d.get("result", {}).get("data_array", []) or []])
    return out


def _view(token: str | None) -> dict:
    try:
        who, rows, equip = _run_rest([WHO, QUERY, EQUIP], token) if token else _run([(WHO, None), (QUERY, None), (EQUIP, None)], None)
        return {"principal": who[0]["principal"], "jv_partner": bool(who[0]["jv_partner"]), "rows": rows, "equipment": equip,
                "total_rows": sum(r["zone_rows"] for r in rows), "error": None}
    except Exception as e:
        return {"principal": None, "jv_partner": None, "rows": [], "equipment": [], "total_rows": 0, "error": f"{type(e).__name__}: {str(e)[:240]}"}


def _identity(request: Request) -> tuple[str | None, str | None]:
    h = {k.lower(): v for k, v in request.headers.items()}
    return h.get("x-forwarded-email"), h.get("x-forwarded-access-token")


@router.get("/governance/uc_policy")
async def uc_policy(request: Request):
    email, token = _identity(request)
    sp, you = await asyncio.gather(asyncio.to_thread(_view, None),
                                   asyncio.to_thread(_view, token) if token else asyncio.sleep(0, result=None))
    return {
        "user": email, "query": QUERY, "policy_sql": POLICY_SQL, "partner_basin": PARTNER_BASIN,
        "app_sp": sp,
        "you": you or {"error": "No user token forwarded (open the app in a fresh window so it carries the sql scope)."},
    }


@router.post("/governance/uc_policy/partner")
async def set_partner(request: Request, on: bool = True):
    """Map (or unmap) the signed-in user as a JV partner on one basin. Written by the
    app service principal, which holds MODIFY on access_personas only."""
    email, _ = _identity(request)
    if not email or not EMAIL.match(email):
        return {"ok": False, "error": "No signed-in user email forwarded."}
    stmts = [(f"DELETE FROM {CATALOG}.{SCHEMA}.access_personas WHERE principal = :p", {"p": email})]
    if on:
        stmts.append((f"INSERT INTO {CATALOG}.{SCHEMA}.access_personas VALUES (:p, 'jv_partner', :b, 'demo toggle from the app')",
                      {"p": email, "b": PARTNER_BASIN}))
    try:
        await asyncio.to_thread(_run, stmts, None)
        return {"ok": True, "jv_partner": on, "user": email}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {str(e)[:240]}"}



AUDIT_TABLES = ["gold_zone_summary", "well_h2s_profile", "access_personas", "business_glossary", "engineer_rules",
                "equipment_component_spec", "engineer_tickets"]
AUDIT_SQL = (
    "SELECT date_format(event_time, 'yyyy-MM-dd HH:mm:ss') AS at, coalesce(user_identity.email, 'unknown') AS who, "
    "action_name AS action, element_at(split(request_params['full_name_arg'], '\\\\.'), -1) AS object, "
    "response.status_code AS status FROM system.access.audit "
    "WHERE event_date >= current_date() - 2 AND service_name = 'unityCatalog' AND request_params['full_name_arg'] IN ("
    + ", ".join(f"'{CATALOG}.{SCHEMA}.{t}'" for t in AUDIT_TABLES) + ") ORDER BY event_time DESC LIMIT 30"
)


@router.get("/governance/audit_trail")
async def audit_trail(request: Request):
    """Who accessed or changed the governed tables, and when, from system.access.audit.
    Runs as the signed-in user (system tables are rarely granted to app service principals)."""
    _, token = _identity(request)
    try:
        rows = (await asyncio.to_thread(_run_rest, [AUDIT_SQL], token))[0] if token else (await asyncio.to_thread(_run, [(AUDIT_SQL, None)]))[0]
        return {"rows": rows, "source": "system.access.audit", "query": AUDIT_SQL, "error": None}
    except Exception as e:
        return {"rows": [], "source": "system.access.audit", "query": AUDIT_SQL, "error": f"{type(e).__name__}: {str(e)[:200]}"}
