"""H2S proof points: live Genie questions and direct glossary queries, captured verbatim.

Every answer below is produced by the live FEVM workspace when this script runs:
Genie's text, the SQL it generated, and the rows it returned; and the result of
direct SQL over the governed glossary, rules and H2S tables. Output:
docs/evidence/16_h2s_proof_points.md (readable) and .json (raw).

    python scripts/h2s_proof_points.py --profile fe-vm-oil-pump-monitor
"""
import argparse
import datetime as dt
import json
import time
from pathlib import Path

from databricks.sdk import WorkspaceClient

SPACE = "01f17bdeaeee136fbd65013d3eb40261"
WAREHOUSE = "87e069097741b56c"
FQS = "oil_pump_monitor_catalog.subsurface_command"
OUT = Path(__file__).resolve().parent.parent / "docs" / "evidence"

GENIE_QUESTIONS = [
    "Which wells are sour, and what is each one's H2S severity band and last measured ppm?",
    "Why is EASTTEXAS-05 flagged for an H2S safety audit? Show the rule, its glossary definition and the data behind it.",
    "What does the glossary say the H2S re-sample interval is, and which wells are overdue?",
    "What sour-service equipment does EASTTEXAS-05 need, and what is the longest lead time?",
    "Which wellhead and casing parts will stock out before a reorder arrives?",
    "What do the engineer action rules mean, and who owns each threshold?",
    "How much sour-service upgrade capex does EASTTEXAS-05 carry relative to its live NPV?",
    "What PPE and monitoring does EASTTEXAS-05 require?",
]

SQL_QUERIES = [
    ("The rule catalog: each rule with its glossary definition, owner, live threshold and open items today",
     f"SELECT rule_id, rule_title, glossary_term, threshold_value, definition_owner, open_items_today FROM {FQS}.v_engineer_rule_catalog ORDER BY rule_id"),
    ("Glossary terms attached to the columns they govern (Unity Catalog column tags)",
     f"""SELECT g.term, g.owner, g.threshold, concat_ws(', ', collect_list(concat(t.table_name, '.', t.column_name))) AS governs
         FROM {FQS}.business_glossary g JOIN oil_pump_monitor_catalog.information_schema.column_tags t
           ON t.tag_name = 'glossary_term' AND t.tag_value = g.term AND t.schema_name = 'subsurface_command'
         GROUP BY g.term, g.owner, g.threshold ORDER BY g.term"""),
    ("The H2S safety audit rule evaluated live, reading its threshold from the glossary",
     f"""SELECT h.well_id, h.h2s_ppm_last_measured, h.last_safety_audit_date,
                datediff(current_date(), h.last_safety_audit_date) AS days_since_audit,
                g.threshold_value AS glossary_interval_days, g.owner AS threshold_owner,
                datediff(current_date(), h.last_safety_audit_date) > g.threshold_value AS overdue
         FROM {FQS}.well_h2s_profile h CROSS JOIN {FQS}.business_glossary g
         WHERE g.term = 'H2S safety audit interval' AND (h.sour_classified OR h.h2s_ppm_last_measured >= 100)
         ORDER BY days_since_audit DESC"""),
    ("Relationships declared in Unity Catalog for the glossary layer (primary and foreign keys)",
     f"""SELECT tc.table_name AS from_table, tc.constraint_name, ccu.table_name AS to_table
         FROM oil_pump_monitor_catalog.information_schema.referential_constraints rc
         JOIN oil_pump_monitor_catalog.information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
         JOIN oil_pump_monitor_catalog.information_schema.constraint_table_usage ccu ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
         WHERE tc.table_schema = 'subsurface_command' AND tc.table_name IN ('engineer_rules', 'engineer_tickets', 'well_h2s_profile') ORDER BY 1"""),
    ("Sour-service equipment for the extreme-sour well, from the governed equipment view",
     f"""SELECT component_name, required_spec, degradation_mechanism, risk_score, upgrade_capex_musd, upgrade_lead_weeks
         FROM {FQS}.well_equipment_integrity WHERE well_id = 'EASTTEXAS-05' ORDER BY upgrade_lead_weeks DESC"""),
]


def run_sql(w, q):
    r = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE, statement=q, wait_timeout="50s")
    if r.status.state.value != "SUCCEEDED":
        return [], [], str(r.status.error.message)[:300]
    return [c.name for c in r.manifest.schema.columns], r.result.data_array or [], None


def ask(w, q):
    t0 = time.time()
    m = w.genie.start_conversation_and_wait(SPACE, q)
    out = {"question": q, "status": m.status.value if m.status else None, "seconds": round(time.time() - t0, 1),
           "conversation_id": m.conversation_id, "message_id": m.id, "text": None, "sql": None, "columns": [], "rows": []}
    for a in m.attachments or []:
        if a.text and a.text.content:
            out["text"] = a.text.content
        if a.query:
            out["sql"] = a.query.query
            try:
                sr = w.genie.get_message_attachment_query_result(SPACE, m.conversation_id, m.id, a.attachment_id).statement_response
                out["columns"] = [c.name for c in sr.manifest.schema.columns]
                out["rows"] = (sr.result.data_array or [])[:15]
            except Exception as e:
                out["rows_error"] = str(e)[:200]
    return out


def md_table(cols, rows):
    if not cols:
        return "_no rows_"
    fmt = lambda v: "" if v is None else str(v).replace("|", "/").replace("\n", " ")[:120]
    return "\n".join(["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)] + ["| " + " | ".join(fmt(v) for v in r) + " |" for r in rows])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="fe-vm-oil-pump-monitor")
    a = ap.parse_args()
    w = WorkspaceClient(profile=a.profile)
    now = dt.datetime.now(dt.timezone.utc)
    genie = []
    for q in GENIE_QUESTIONS:
        g = ask(w, q)
        genie.append(g)
        print(f"[{g['status']} {g['seconds']}s] {q}")
    sqls = []
    for title, q in SQL_QUERIES:
        cols, rows, err = run_sql(w, q)
        sqls.append({"title": title, "sql": q, "columns": cols, "rows": rows, "error": err})
        print(f"[{'ok' if not err else 'ERR'} {len(rows)} rows] {title}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "16_h2s_proof_points.json").write_text(json.dumps({"captured": now.isoformat(), "genie_space": SPACE, "genie": genie, "sql": sqls}, indent=2, default=str))
    md = ["# H2S proof points: Genie and the governed glossary", "",
          f"Captured live from the FEVM workspace on {now.strftime('%Y-%m-%d %H:%M UTC')} by `scripts/h2s_proof_points.py`. "
          f"Genie space `{SPACE}`; every answer, its generated SQL and its result rows are reproduced verbatim. "
          f"{sum(1 for g in genie if g['status'] == 'COMPLETED')} of {len(genie)} Genie questions completed.", "",
          "## Part 1: Genie answers H2S and glossary questions", ""]
    for i, g in enumerate(genie, 1):
        md += [f"### Q{i}. {g['question']}", "", f"Status **{g['status']}** in {g['seconds']} s (conversation `{g['conversation_id']}`).", "",
               "**Genie's answer:**", "", *["> " + l if l.strip() else ">" for l in (g["text"] or "_no text_").splitlines()], ""]
        if g["sql"]:
            md += ["**SQL Genie generated:**", "", "```sql", g["sql"].strip(), "```", ""]
        if g["rows"]:
            md += ["**Rows returned:**", "", md_table(g["columns"], g["rows"]), ""]
    md += ["## Part 2: The governed glossary, queried directly", ""]
    for i, s in enumerate(sqls, 1):
        md += [f"### G{i}. {s['title']}", "", "```sql", s["sql"].strip(), "```", "",
               (md_table(s["columns"], s["rows"]) if not s["error"] else f"Error: {s['error']}"), ""]
    (OUT / "16_h2s_proof_points.md").write_text("\n".join(md))
    print("wrote", OUT / "16_h2s_proof_points.md")


if __name__ == "__main__":
    main()
