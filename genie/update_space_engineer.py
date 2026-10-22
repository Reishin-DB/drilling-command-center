"""
Add the engineer morning-briefing layer to the Subsurface Command Genie space.

The operations agent raises action items from governed glossary rules over UC
data. This gives Genie the same business context, so an engineer can ask "why
is EASTTEXAS-05 flagged?" and get the rule, its glossary definition, and the
data behind it. Tables are added, one text-instruction block is placed before
the petrophysics block (update_space.py truncates after its own marker, so this
order keeps both on re-runs), and example SQL is merged in.

    python genie/update_space_engineer.py --profile fe-vm-oil-pump-monitor
"""
from __future__ import annotations

import argparse
import json
import uuid

from databricks.sdk import WorkspaceClient

SPACE_ID = "01f17bdeaeee136fbd65013d3eb40261"
TABLES = ["business_glossary", "engineer_rules", "engineer_tickets", "engineer_action_log",
          "well_h2s_profile", "well_equipment_integrity", "drilling_inventory"]
MARKER = "### Engineer action items, glossary, and H2S rules"
NEXT_MARKER = "### Petrophysics, net pay, and synthetic sonic"

INSTRUCTIONS = MARKER + """
- The operations agent raises engineer action items from engineer_rules. Each rule has a glossary_term that
  joins to business_glossary.term (definition, threshold, owner). When asked why a well is flagged, what an
  action item means, or what a threshold is, answer from business_glossary and engineer_rules, then show the
  live data from the source table the rule reads.
- Rule meanings: R-H2S-AUDIT = sour well whose last_safety_audit_date is more than 365 days ago (well_h2s_profile);
  R-H2S-SAMPLE = sour well whose h2s_measurement_date is more than 180 days ago; R-SAF-CRIT = safety_status 'critical';
  R-EQ-LONGLEAD = components in well_equipment_integrity with risk_score >= 90 and upgrade_lead_weeks >= 18;
  R-INV-COVER = drilling_inventory parts in Wellhead or Casing whose on_hand_qty / daily_burn (days of cover) is below
  lead_time_days, for wells in the high or extreme severity band; R-ECON-SOURCAPEX = sour upgrade capex at or above
  10% of npv10_live_musd in well_economics.
- A sour well is h2s_ppm_last_measured >= 100 or sour_classified. EASTTEXAS-05 is the extreme-sour well (12,000 ppm).
- engineer_tickets holds tickets raised from action items (ticket_id, item_key, rule_id, well_id, title, status);
  engineer_action_log holds close-outs. item_key is rule_id|well_id|subject.
- Use current_date() for "days since" questions. Never invent thresholds: read them from business_glossary.
"""

EXAMPLES = [
    ("Why is EASTTEXAS-05 flagged for an H2S safety audit?",
     "SELECT r.rule_id, r.title, g.term, g.definition, g.threshold, g.owner,\n"
     "       h.well_id, h.h2s_ppm_last_measured, h.last_safety_audit_date,\n"
     "       datediff(current_date(), h.last_safety_audit_date) AS days_since_audit, h.safety_status\n"
     "FROM {fq}.engineer_rules r JOIN {fq}.business_glossary g ON g.term = r.glossary_term\n"
     "CROSS JOIN {fq}.well_h2s_profile h\nWHERE r.rule_id = 'R-H2S-AUDIT' AND h.well_id = 'EASTTEXAS-05'"),
    ("Which sour-service components on EASTTEXAS-05 are long-lead?",
     "SELECT component_name, required_spec, degradation_mechanism, risk_score, upgrade_capex_musd, upgrade_lead_weeks\n"
     "FROM {fq}.well_equipment_integrity\nWHERE well_id = 'EASTTEXAS-05' AND risk_score >= 90 AND upgrade_lead_weeks >= 18\n"
     "ORDER BY upgrade_lead_weeks DESC"),
    ("Which wellhead and casing parts will stock out before a reorder arrives?",
     "SELECT part_id, part_name, category, on_hand_qty, daily_burn, ROUND(on_hand_qty / daily_burn, 1) AS days_of_cover,\n"
     "       lead_time_days, supplier\nFROM {fq}.drilling_inventory\n"
     "WHERE category IN ('Wellhead', 'Casing') AND on_hand_qty / daily_burn < lead_time_days\nORDER BY days_of_cover"),
    ("What do the engineer action rules mean?",
     "SELECT r.rule_id, r.title, r.severity, r.owner_role, g.term, g.definition, g.threshold, r.action\n"
     "FROM {fq}.engineer_rules r JOIN {fq}.business_glossary g ON g.term = r.glossary_term\nORDER BY r.rule_id"),
    ("Which tickets have engineers raised from action items?",
     "SELECT ticket_id, created_at, created_by, rule_id, well_id, title, status\nFROM {fq}.engineer_tickets\n"
     "ORDER BY created_at DESC"),
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
    block = INSTRUCTIONS.rstrip("\n") + "\n\n"
    if text:
        content = "".join(text[0]["content"])
        if MARKER in content:  # drop our previous block, up to the next block or the end
            start = content.index(MARKER)
            end = content.index(NEXT_MARKER, start) if NEXT_MARKER in content[start:] else len(content)
            content = content[:start] + content[end:]
        if NEXT_MARKER in content:
            i = content.index(NEXT_MARKER)
            content = content[:i] + block + content[i:]
        else:
            content = content.rstrip("\n") + "\n\n" + block
        text[0]["content"] = [line + "\n" for line in content.rstrip("\n").split("\n")]
    else:
        text.append({"id": _id(), "content": [line + "\n" for line in block.split("\n")]})

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
    cur = w.api_client.do("GET", f"/api/2.0/genie/spaces/{args.space_id}", query={"include_serialized_space": "true"})
    space = merge(json.loads(cur["serialized_space"]), fq)
    w.api_client.do("PATCH", f"/api/2.0/genie/spaces/{args.space_id}", body={"serialized_space": json.dumps(space)})
    print(f"updated {args.space_id}: {len(space['data_sources']['tables'])} tables, "
          f"{len(space['instructions']['example_question_sqls'])} example SQLs")


if __name__ == "__main__":
    main()
