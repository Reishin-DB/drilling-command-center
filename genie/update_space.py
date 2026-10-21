"""
Merge the petrophysics and synthetic-sonic layer into the existing Subsurface
Command Genie space, without touching what is already there.

The space already carries economics, H2S, FDP, metric views, and certified
functions. This adds the gold tables from the pipeline and the sonic model,
one text-instruction block (replaced in place on re-run, found by its marker),
and example SQL, including the distance question Genie used to answer with
naive lat/lon math instead of the certified f_wells_within_km function.

Instructions and example SQL go in `serialized_space`; that is the only place
the Genie API keeps them.

    python genie/update_space.py --profile fe-vm-oil-pump-monitor
"""
from __future__ import annotations

import argparse
import json
import uuid

from databricks.sdk import WorkspaceClient

SPACE_ID = "01f17bdeaeee136fbd65013d3eb40261"
TABLES = ["gold_zone_summary", "gold_synthetic_sonic", "gold_sonic_model_metrics", "gold_petrophysics"]
MARKER = "### Petrophysics, net pay, and synthetic sonic"

INSTRUCTIONS = MARKER + """
- gold_zone_summary: net pay per well and formation (gross_ft, net_pay_ft, net_to_gross, avg_pay_phi,
  avg_pay_sw, hc_pore_ft). Pay = effective porosity >= 0.08, Sw <= 0.50, Vcl <= 0.35. Use it for
  "net pay", "best zone", "where is the pay", "net-to-gross". Westwater is the gas-bearing reservoir.
  Filter role = 'app_well' unless the user asks about offset or training wells.
- gold_petrophysics: per-sample (2 ft) Vcl, phi_total, phi_eff, sw, is_pay. Only for depth-level questions.
- gold_synthetic_sonic: sonic (DT, us/ft) per sample for the app wells. dt_measured is the logged
  curve, dt_model is the served synthetic_sonic champion, dt_gardner is the textbook Gardner transform.
  dt_source = 'synthetic' where the well never ran a sonic tool (GREENRIVER-03).
- gold_sonic_model_metrics: leave-one-well-out evaluation, one row per method (mae, rmse, r2, bias in us/ft).
  When asked whether the model can be trusted, compare method = 'model' to 'gardner_calibrated'.
- Well ids (SANJUAN-01, GREENRIVER-03, ...) are shared with operator_wells and well_economics:
  join on well_id to put net pay next to NPV.
- JV partners see only their basins and NULL for avg_pay_sw and hc_pore_ft. A NULL there is a
  governance mask, not missing data; say so.

### DISTANCE (overrides any lat/lon math)
- For "wells within N km of X", "near", "offset wells within", ALWAYS call the certified function:
  SELECT * FROM oil_pump_monitor_catalog.subsurface_command.f_wells_within_km('<well_id>', <km>)
  It returns well_id, well_name, basin, km, same_basin. Never compute distance from lat/lon.
"""

EXAMPLES = [
    ("Which wells are within 500 km of SANJUAN-01?",
     "SELECT well_id, well_name, basin, ROUND(km, 1) AS km, same_basin\n"
     "FROM {fq}.f_wells_within_km('SANJUAN-01', 500)\nORDER BY km"),
    ("Where is the net pay in each app well?",
     "SELECT well_id, basin, formation_name, net_pay_ft, net_to_gross, avg_pay_phi, avg_pay_sw\n"
     "FROM {fq}.gold_zone_summary\nWHERE role = 'app_well' AND net_pay_ft > 0\n"
     "ORDER BY well_id, net_pay_ft DESC"),
    ("How good is the synthetic sonic model compared to Gardner?",
     "SELECT method, ROUND(mae, 2) AS mae_usft, ROUND(rmse, 2) AS rmse_usft, ROUND(r2, 3) AS r2, n_wells\n"
     "FROM {fq}.gold_sonic_model_metrics\nORDER BY mae"),
    ("Show the synthetic sonic for GREENRIVER-03 by formation",
     "SELECT formation_name, ROUND(AVG(dt_model), 1) AS dt_model_usft, ROUND(AVG(dt_gardner), 1) AS dt_gardner_usft,\n"
     "       COUNT(*) AS samples\nFROM {fq}.gold_synthetic_sonic\nWHERE well_id = 'GREENRIVER-03'\n"
     "GROUP BY formation_name ORDER BY MIN(md_ft)"),
]


def _id() -> str:
    return uuid.uuid4().hex


def merge(space: dict, fq: str) -> dict:
    tables = space["data_sources"]["tables"]
    have = {t["identifier"] for t in tables}
    tables += [{"identifier": f"{fq}.{t}"} for t in TABLES if f"{fq}.{t}" not in have]
    tables.sort(key=lambda t: t["identifier"])

    ins = space.setdefault("instructions", {})
    text = ins.setdefault("text_instructions", [])
    block = [line + "\n" for line in INSTRUCTIONS.splitlines()]
    if text:  # one text-instruction entry per space: replace our block, keep the rest
        content = "".join(text[0]["content"])
        if MARKER in content:
            content = content[:content.index(MARKER)].rstrip("\n")
        text[0]["content"] = [content + "\n\n"] + block
    else:
        text.append({"id": _id(), "content": block})

    sqls = ins.setdefault("example_question_sqls", [])
    asked = {e["question"][0] for e in sqls}
    sqls += [{"id": _id(), "question": [q], "sql": [sql.format(fq=fq)]} for q, sql in EXAMPLES if q not in asked]
    sqls.sort(key=lambda e: e["id"])
    return space


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="fe-vm-oil-pump-monitor")
    ap.add_argument("--catalog", default="oil_pump_monitor_catalog")
    ap.add_argument("--schema", default="subsurface_command")
    ap.add_argument("--space-id", default=SPACE_ID)
    args = ap.parse_args()
    fq = f"{args.catalog}.{args.schema}"
    w = WorkspaceClient(profile=args.profile)
    cur = w.api_client.do("GET", f"/api/2.0/genie/spaces/{args.space_id}",
                          query={"include_serialized_space": "true"})
    space = merge(json.loads(cur["serialized_space"]), fq)
    w.api_client.do("PATCH", f"/api/2.0/genie/spaces/{args.space_id}",
                    body={"serialized_space": json.dumps(space)})
    print(f"updated {args.space_id}: {len(space['data_sources']['tables'])} tables, "
          f"{len(space['instructions']['example_question_sqls'])} example SQLs")


if __name__ == "__main__":
    main()
