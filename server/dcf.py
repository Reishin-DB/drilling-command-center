"""One definition of well economics for the whole app.

The certified Unity Catalog functions calculate_npv10 and calculate_break_even
are the source of truth: 10 years of exponential decline, oil revenue at WTI
minus fixed opex, discounted at 10%, minus capex. price_uc() calls them on the
SQL warehouse for a batch of wells in one statement; the Python functions here
are the same formulas, used for IRR and payback (which the UC functions do not
return) and as a labelled fallback if the warehouse is unreachable.
"""
import os

CATALOG = os.getenv("ADME_CATALOG", "oil_pump_monitor_catalog")
SCHEMA = os.getenv("ADME_SCHEMA", "subsurface_command")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "87e069097741b56c")
FQS = f"{CATALOG}.{SCHEMA}"
YEARS = 10
RATE = 0.10


def _flows(c: dict) -> list[float]:
    return [c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 * c["wti"] - c["opex_musd_yr"] * 1e6
            for y in range(YEARS)]


def npv10(c: dict) -> float:
    return round(sum(f / (1 + RATE) ** (y + 1) for y, f in enumerate(_flows(c))) / 1e6 - c["capex_musd"], 2)


def break_even(c: dict) -> float | None:
    num = c["capex_musd"] * 1e6 + sum(c["opex_musd_yr"] * 1e6 / (1 + RATE) ** (y + 1) for y in range(YEARS))
    den = sum(c["peak_rate_bopd"] * (1 - c["decline_pct_yr"] / 100) ** y * 365 / (1 + RATE) ** (y + 1) for y in range(YEARS))
    return round(num / den, 2) if den else None


def irr(c: dict) -> float | None:
    flows = [-c["capex_musd"] * 1e6] + _flows(c)
    npv = lambda r: sum(f / (1 + r) ** t for t, f in enumerate(flows))
    # Bracket on the economic range first; very negative rates let small late
    # cash flows dominate and flip the sign.
    for lo, hi in ((0.0, 10.0), (-0.5, 0.0)):
        if npv(lo) * npv(hi) <= 0:
            break
    else:
        return None
    for _ in range(80):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return round(mid * 100, 1)


def payback(c: dict) -> float | None:
    cum = -c["capex_musd"] * 1e6
    for y, cf in enumerate(_flows(c)):
        if cum + cf >= 0:
            return round(y + (-cum) / cf, 1) if cf > 0 else None
        cum += cf
    return None


def args_sql(c: dict) -> str:
    return f"{c['capex_musd']}, {c['opex_musd_yr']}, {c['peak_rate_bopd']}, {c['decline_pct_yr']}"


def sql_for(c: dict) -> str:
    a = args_sql(c)
    return (f"SELECT round({FQS}.calculate_npv10({a}, {c['wti']}, {YEARS}), 2) AS npv10_musd,\n"
            f"       round({FQS}.calculate_break_even({a}), 2) AS break_even_wti")


def price_uc(cases: list[dict]) -> list[dict]:
    """Price a batch of wells with the certified UC functions in one statement."""
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    rows = ", ".join(f"({i}, {args_sql(c)}, {c['wti']})" for i, c in enumerate(cases))
    sql = (f"SELECT i, round({FQS}.calculate_npv10(capex, opex, peak, decl, wti, {YEARS}), 2) AS npv10_musd, "
           f"round({FQS}.calculate_break_even(capex, opex, peak, decl), 2) AS break_even_wti "
           f"FROM VALUES {rows} AS t(i, capex, opex, peak, decl, wti) ORDER BY i")
    with dbsql.connect(server_hostname=host, http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
                       credentials_provider=lambda: cfg.authenticate) as conn, conn.cursor() as cur:
        cur.execute(sql)
        out = cur.fetchall_arrow().to_pylist()
    return [{"npv10_musd": float(r["npv10_musd"]), "break_even_wti": float(r["break_even_wti"])} for r in out]


def price(cases: list[dict]) -> tuple[list[dict], str, str | None]:
    """NPV10 and break-even from the UC functions (Python mirror on failure), plus
    IRR and payback from the same cash flows. Returns (results, source, error)."""
    try:
        base, source, err = price_uc(cases), "uc_function", None
    except Exception as e:
        base = [{"npv10_musd": npv10(c), "break_even_wti": break_even(c)} for c in cases]
        source, err = "python_fallback", f"{type(e).__name__}: {str(e)[:160]}"
    return [{**b, "irr_pct": irr(c), "payback_years": payback(c)} for b, c in zip(base, cases)], source, err
