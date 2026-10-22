"""Repeatable eval set for the decision brief.

Runs POST /api/voxels/decision_brief/{well} for every field's anchor well (one
step-out per field) against the deployed app and scores each brief:

  grounded         every figure in the brief appears in the governed facts
  first_try        grounded without the self-correction pass
  cited            at least 5 distinct facts cited
  sections         all five required sections present
  length           at most 260 words
  no_em_dash       no em dashes

Writes docs/evidence/14_brief_eval.json and docs/evidence/14_brief_eval.md, and
appends one row per case to gold_brief_eval so the trend is queryable.

    python ml/brief_eval.py --profile fe-vm-oil-pump-monitor
"""
import argparse
import datetime as dt
import json
import re
import uuid
from pathlib import Path

import requests
from databricks.sdk import WorkspaceClient

APP_URL = "https://subsurface-command-7474647106303257.aws.databricksapps.com"
CASES = ["SANJUAN-01", "GREENRIVER-03", "PERMIAN-04", "EASTTEXAS-05", "PERMIAN-06"]
SECTIONS = ["Recommendation", "Why this well", "Why now", "Risks and how they are controlled", "Next actions"]
OUT = Path(__file__).resolve().parent.parent / "docs" / "evidence"
FQS = "oil_pump_monitor_catalog.subsurface_command"


def score(b: dict) -> dict:
    plan, v = b["plan"], b["validation"]
    return {
        "grounded": v["grounded"],
        "first_try": not b.get("first_attempt_unsupported"),
        "cited": len(v["facts_cited"]) >= 5,
        "sections": all(s.lower() in plan.lower() for s in SECTIONS),
        "length": len(re.findall(r"\w+", re.sub(r"\[[A-Z]\d+\]", "", plan))) <= 260,
        "no_em_dash": "—" not in plan,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="fe-vm-oil-pump-monitor")
    a = ap.parse_args()
    w = WorkspaceClient(profile=a.profile)
    token = w.config.authenticate()["Authorization"]
    run_id, now = str(uuid.uuid4()), dt.datetime.now(dt.timezone.utc)
    rows = []
    for well in CASES:
        b = requests.post(f"{APP_URL}/api/voxels/decision_brief/{well}", headers={"Authorization": token}, timeout=300).json()
        if b.get("error"):
            rows.append({"well": well, "error": b["error"]})
            continue
        s = score(b)
        rows.append({"well": well, "field": b["facts"][0]["value"].split(" field")[0].split(" in the ")[-1],
                     "served_by": b["served_by"], "attempts": b.get("attempts", 1),
                     "first_attempt_unsupported": b.get("first_attempt_unsupported", []),
                     "figures_checked": b["validation"]["figures_checked"], "unsupported": b["validation"]["unsupported"],
                     "facts_cited": len(b["validation"]["facts_cited"]), "facts_given": len(b["facts"]),
                     "words": len(re.findall(r"\w+", re.sub(r"\[[A-Z]\d+\]", "", b["plan"]))), **s,
                     "pass": all(s[k] for k in ("grounded", "cited", "sections", "length", "no_em_dash")),
                     "brief_id": b["brief_id"], "plan": b["plan"]})
        print(f"{well:14s} grounded={s['grounded']} first_try={s['first_try']} cited={rows[-1]['facts_cited']}/{rows[-1]['facts_given']} "
              f"sections={s['sections']} words={rows[-1]['words']} pass={rows[-1]['pass']}")
    ok = [r for r in rows if "error" not in r]
    summary = {"run_id": run_id, "ran_at": now.isoformat(), "cases": len(rows), "passed": sum(r["pass"] for r in ok),
               "grounded": sum(r["grounded"] for r in ok), "first_try": sum(r["first_try"] for r in ok),
               "self_corrected": sum(1 for r in ok if r["attempts"] > 1)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "14_brief_eval.json").write_text(json.dumps({"summary": summary, "cases": rows}, indent=2))
    md = ["# Decision brief eval set", "", f"Run {run_id} at {now.strftime('%Y-%m-%d %H:%M UTC')} against the deployed app, one step-out per field (`ml/brief_eval.py`).", "",
          f"**{summary['passed']} of {summary['cases']} briefs pass** all checks; {summary['grounded']} fully grounded, {summary['first_try']} grounded on the first draft, {summary['self_corrected']} needed the self-correction pass.", "",
          "| Well | Model | Grounded | First draft grounded | Figures checked | Facts cited | Sections | Words | Pass |", "|---|---|---|---|---|---|---|---|---|",
          *[f"| {r['well']} | {r['served_by']} | {r['grounded']} | {r['first_try']}{' (removed ' + ', '.join(r['first_attempt_unsupported']) + ')' if r['first_attempt_unsupported'] else ''} | {r['figures_checked']} | {r['facts_cited']}/{r['facts_given']} | {r['sections']} | {r['words']} | {r['pass']} |" if 'error' not in r else f"| {r['well']} | error: {r['error']} |" for r in rows], ""]
    for r in ok:
        md += [f"## {r['well']}", "", *["> " + l if l.strip() else ">" for l in r["plan"].splitlines()], ""]
    (OUT / "14_brief_eval.md").write_text("\n".join(md))
    vals = ", ".join(f"('{run_id}', current_timestamp(), '{r['well']}', '{r['served_by']}', {int(r['attempts'])}, {int(r['figures_checked'])}, "
                     f"{len(r['unsupported'])}, {int(r['facts_cited'])}, {str(r['grounded']).lower()}, {str(r['first_try']).lower()}, {str(r['pass']).lower()}, '{r['brief_id']}')" for r in ok)
    for st in [f"CREATE TABLE IF NOT EXISTS {FQS}.gold_brief_eval (run_id STRING, ran_at TIMESTAMP, well_id STRING, served_by STRING, attempts INT, figures_checked INT, unsupported INT, facts_cited INT, grounded BOOLEAN, first_try BOOLEAN, pass BOOLEAN, brief_id STRING) COMMENT 'Eval set for the decision brief: one row per case per run.'",
               f"INSERT INTO {FQS}.gold_brief_eval VALUES {vals}"]:
        w.statement_execution.execute_statement(warehouse_id="87e069097741b56c", statement=st, wait_timeout="50s")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
