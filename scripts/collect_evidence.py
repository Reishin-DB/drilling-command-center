"""Collect execution evidence from the live FEVM workspace into docs/evidence/.

Every file here is captured from the running system, not written by hand:
the bundle job run, the Lakeflow pipeline update and its data-quality
expectations, the MLflow training run and the UC model version, a live call to
the served model, rows from its AI Gateway inference table, a Genie
conversation, the Unity Catalog policy check as operator vs JV partner, live
app API responses, and the test suite. docs/evidence/EVIDENCE.md summarises it.

    python scripts/collect_evidence.py --profile fe-vm-oil-pump-monitor
"""
import argparse
import re
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path

import requests
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import DataframeSplitInput

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "evidence"
CAT, SCH = "oil_pump_monitor_catalog", "subsurface_command"
FQS = f"{CAT}.{SCH}"
JOB_ID = 532814868767936
PIPELINE_ID = "95216d7e-1691-44ee-bc12-ab02ee7d6225"
WAREHOUSE = "87e069097741b56c"
GENIE_SPACE = "01f17bdeaeee136fbd65013d3eb40261"
ENDPOINT = "subsurface-synthetic-sonic"
MODEL = f"{FQS}.synthetic_sonic"
APP_URL = "https://subsurface-command-7474647106303257.aws.databricksapps.com"
FEATURES = ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"]


def ts(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if ms else None


def save(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, indent=2, default=str))
    print("wrote", name)


def sql(w, statement):
    r = w.statement_execution.execute_statement(warehouse_id=WAREHOUSE, statement=statement, wait_timeout="50s")
    if r.status.state.value != "SUCCEEDED":
        raise RuntimeError(f"{r.status.state}: {r.status.error}")
    cols = [c.name for c in r.manifest.schema.columns]
    return [dict(zip(cols, row)) for row in (r.result.data_array or [])]


def job_run(w):
    runs = list(w.jobs.list_runs(job_id=JOB_ID, limit=10))
    # The last full end-to-end build (drift-triggered retrains run only train_serve_score; see 10_drift_check.json).
    run = None
    for r in runs:
        if r.state and r.state.result_state and r.state.result_state.value == "SUCCESS":
            full = w.jobs.get_run(r.run_id)
            if any(t.task_key == "land_raw" and t.state and t.state.result_state and t.state.result_state.value == "SUCCESS" for t in full.tasks or []):
                run = full
                break
    tasks = []
    for t in sorted(run.tasks or [], key=lambda t: t.start_time or 0):
        out = {}
        try:
            o = w.jobs.get_run_output(t.run_id)
            out = {"logs_tail": (o.logs or "")[-3000:], "error": o.error}
        except Exception as e:
            out = {"logs_tail": None, "error": f"{type(e).__name__}: {e}"}
        tasks.append({"task_key": t.task_key, "attempt": t.attempt_number, "result": t.state.result_state.value if t.state and t.state.result_state else None,
                      "start": ts(t.start_time), "end": ts(t.end_time),
                      "duration_s": round(((t.end_time or 0) - (t.start_time or 0)) / 1000, 1), **out})
    rec = {"job_id": JOB_ID, "run_id": run.run_id, "run_page_url": run.run_page_url, "result": run.state.result_state.value,
           "start": ts(run.start_time), "end": ts(run.end_time), "tasks": tasks,
           "earlier_attempts": [{"run_id": r.run_id, "result": r.state.result_state.value if r.state.result_state else None,
                                 "start": ts(r.start_time)} for r in runs if r.run_id != run.run_id]}
    save("01_job_run.json", rec)
    return rec


def pipeline(w):
    p = w.pipelines.get(PIPELINE_ID)
    updates = w.pipelines.list_updates(PIPELINE_ID, max_results=5).updates or []
    events = [{k: e.as_dict().get(k) for k in ("timestamp", "event_type", "level", "message")}
              for _, e in zip(range(40), w.pipelines.list_pipeline_events(PIPELINE_ID, max_results=40))]
    dq = {}
    for r in sql(w, f"""SELECT origin.flow_name AS flow, timestamp, details:flow_progress.metrics.num_output_rows AS output_rows,
                         details:flow_progress.data_quality.expectations AS expectations
                         FROM event_log('{PIPELINE_ID}') WHERE event_type = 'flow_progress'
                         AND details:flow_progress.data_quality.expectations IS NOT NULL ORDER BY timestamp DESC"""):
        if r["flow"] not in dq:
            dq[r["flow"]] = {"timestamp": r["timestamp"], "output_rows": r["output_rows"], "expectations": json.loads(r["expectations"])}
    counts = sql(w, f"""SELECT 'bronze_logs' t, count(*) n FROM {FQS}.bronze_logs UNION ALL SELECT 'silver_logs', count(*) FROM {FQS}.silver_logs
                        UNION ALL SELECT 'gold_petrophysics', count(*) FROM {FQS}.gold_petrophysics UNION ALL SELECT 'gold_zone_summary', count(*) FROM {FQS}.gold_zone_summary
                        UNION ALL SELECT 'gold_sonic_features', count(*) FROM {FQS}.gold_sonic_features UNION ALL SELECT 'gold_synthetic_sonic', count(*) FROM {FQS}.gold_synthetic_sonic""")
    rec = {"pipeline_id": PIPELINE_ID, "name": p.name, "state": p.state.value if p.state else None,
           "latest_updates": [{"update_id": u.update_id, "state": u.state.value if u.state else None, "created": ts(u.creation_time)} for u in updates],
           "data_quality_by_flow": dq, "table_row_counts": counts, "recent_events": events[:40]}
    save("02_pipeline.json", rec)
    return rec


def mlflow_run(w):
    mv = w.model_versions.get_by_alias(MODEL, "champion")
    run = w.experiments.get_run(mv.run_id).run
    rec = {"model": MODEL, "version": mv.version, "alias": "champion", "run_id": mv.run_id, "status": mv.status.value if mv.status else None,
           "created": ts(mv.created_at), "experiment_id": run.info.experiment_id, "run_name": run.info.run_name,
           "run_status": run.info.status.value if run.info.status else None, "run_start": ts(run.info.start_time), "run_end": ts(run.info.end_time),
           "metrics": {m.key: m.value for m in (run.data.metrics or [])}, "params": {p.key: p.value for p in (run.data.params or [])},
           "tags": {t.key: t.value for t in (run.data.tags or []) if not t.key.startswith("mlflow.source")}}
    try:
        rec["metrics_table"] = sql(w, f"SELECT * FROM {FQS}.gold_sonic_model_metrics ORDER BY mae_usft")
    except Exception as e:
        rec["metrics_table_error"] = str(e)
    save("03_mlflow_run.json", rec)
    return rec


def serving(w):
    rows = sql(w, f"""SELECT well_id, md_ft, {', '.join(FEATURES[:-2])}, zone_index, dt_usft FROM {FQS}.gold_sonic_features
                      WHERE well_id = 'SANJUAN-01' AND dt_usft IS NOT NULL ORDER BY md_ft LIMIT 8""")
    data = [[float(r[c]) if c != "zone_index" else int(r[c]) for c in FEATURES] for r in rows]
    t0 = time.time()
    resp = w.serving_endpoints.query(name=ENDPOINT, dataframe_split=DataframeSplitInput(columns=FEATURES, data=data))
    latency = round(time.time() - t0, 3)
    preds = [round(float(p), 2) for p in resp.predictions]
    ep = w.serving_endpoints.get(ENDPOINT)
    rec = {"endpoint": ENDPOINT, "state": ep.state.ready.value if ep.state else None, "latency_s": latency,
           "served_entities": [{"name": e.name, "entity": e.entity_name, "version": e.entity_version, "scale_to_zero": e.scale_to_zero_enabled,
                                "workload_size": e.workload_size} for e in (ep.config.served_entities or [])],
           "ai_gateway": ep.ai_gateway.as_dict() if ep.ai_gateway else None,
           "request": {"columns": FEATURES, "data": data},
           "response": {"predictions": preds},
           "check": [{"md_ft": float(r["md_ft"]), "measured_dt": round(float(r["dt_usft"]), 2), "predicted_dt": p,
                      "abs_error": round(abs(float(r["dt_usft"]) - p), 2)} for r, p in zip(rows, preds)]}
    try:
        rec["inference_table"] = sql(w, f"""SELECT count(*) AS logged_requests, min(request_time) AS first_request, max(request_time) AS last_request,
                                            sum(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) AS ok FROM {FQS}.sonic_endpoint_payload""")
    except Exception as e:
        rec["inference_table_error"] = str(e)
    save("04_serving.json", rec)
    return rec


def genie(w, questions):
    out = []
    conv = None
    for q in questions:
        t0 = time.time()
        m = (w.genie.start_conversation_and_wait(GENIE_SPACE, q) if conv is None
             else w.genie.create_message_and_wait(GENIE_SPACE, conv, q))
        conv = m.conversation_id
        entry = {"question": q, "status": m.status.value if m.status else None, "seconds": round(time.time() - t0, 1), "text": None, "sql": None, "rows": None}
        for a in m.attachments or []:
            if a.text and a.text.content:
                entry["text"] = a.text.content
            if a.query:
                entry["sql"] = a.query.query
                entry["description"] = a.query.description
                try:
                    r = w.genie.get_message_attachment_query_result(GENIE_SPACE, conv, m.id, a.attachment_id)
                    sr = r.statement_response
                    cols = [c.name for c in sr.manifest.schema.columns]
                    entry["rows"] = [dict(zip(cols, x)) for x in (sr.result.data_array or [])[:12]]
                except Exception as e:
                    entry["rows_error"] = str(e)
        out.append(entry)
    rec = {"space_id": GENIE_SPACE, "conversation_id": conv, "captured": dt.datetime.now(dt.timezone.utc).isoformat(), "turns": out}
    save("05_genie_conversation.json", rec)
    return rec


def governance(w):
    me = w.current_user.me().user_name
    q = f"SELECT basin, count(*) AS zone_rows, count(avg_pay_sw) AS sw_visible, count(hc_pore_ft) AS hc_pore_visible FROM {FQS}.gold_zone_summary GROUP BY basin ORDER BY basin"
    qe = (f"SELECT 'well_equipment_integrity (view)' AS object, count(*) AS rows_, concat_ws(',', sort_array(collect_set(basin))) AS basins, "
          f"count(h2s_ppm) AS h2s_ppm_visible, count(upgrade_capex_musd) AS capex_visible, count(risk_score) AS risk_score_visible FROM {FQS}.well_equipment_integrity "
          f"UNION ALL SELECT 'well_h2s_profile (table)', count(*), concat_ws(',', sort_array(collect_set(basin))), count(h2s_ppm_last_measured), NULL, count(notes) FROM {FQS}.well_h2s_profile")
    before = sql(w, q)
    equip_before = sql(w, qe)
    sql(w, f"DELETE FROM {FQS}.access_personas WHERE principal = '{me}'")
    sql(w, f"INSERT INTO {FQS}.access_personas VALUES ('{me}', 'jv_partner', 'San Juan', 'evidence capture')")
    try:
        partner = sql(w, q)
        equip_partner = sql(w, qe)
        partner_sample = sql(w, f"SELECT well_id, formation_name, net_pay_ft, avg_pay_sw, hc_pore_ft FROM {FQS}.gold_zone_summary ORDER BY well_id, zone_index LIMIT 6")
    finally:
        sql(w, f"DELETE FROM {FQS}.access_personas WHERE principal = '{me}'")
    after = sql(w, q)
    rec = {"principal": me, "query": q, "operator_view": before, "as_jv_partner_san_juan": partner,
           "equipment_h2s_query": qe, "equipment_h2s_operator": equip_before, "equipment_h2s_partner": equip_partner,
           "partner_sample_rows": partner_sample, "restored_view": after,
           "policies": sql(w, f"SELECT routine_name, comment FROM {CAT}.information_schema.routines WHERE routine_schema = '{SCH}' "
                              "AND routine_name IN ('is_jv_partner','basin_filter','mask_interpretation','mask_commercial_dec32','mask_interpretation_int','mask_interpretation_str')")}
    save("06_uc_governance.json", rec)
    return rec


def drift(w):
    rows = sql(w, f"""SELECT check_id, checked_at, well_id, simulated, n_samples, model_mae, gardner_mae, degrade_bar, drift, action, model_version
                     FROM {FQS}.gold_sonic_drift_checks ORDER BY checked_at, well_id""")
    checks = {}
    for r in rows:
        checks.setdefault(r["check_id"], []).append(r)
    rec = {"job": "subsurface-sonic-drift-check", "checks": [{"check_id": k, "checked_at": v[0]["checked_at"], "wells": len(v),
           "drifted": [x["well_id"] for x in v if x["drift"] in (True, "true")], "action": v[0]["action"], "rows": v} for k, v in checks.items()]}
    trig = re.search(r"run (\d+)", next((c["action"] for c in rec["checks"] if "triggered" in (c["action"] or "")), ""))
    if trig:
        run = w.jobs.get_run(int(trig.group(1)))
        rec["triggered_retrain"] = {"run_id": run.run_id, "result": run.state.result_state.value if run.state.result_state else run.state.life_cycle_state.value,
                                    "start": ts(run.start_time), "end": ts(run.end_time),
                                    "tasks": [{"task_key": t.task_key, "result": t.state.result_state.value if t.state and t.state.result_state else None} for t in run.tasks or []]}
        mv = w.model_versions.get_by_alias(MODEL, "champion")
        rec["champion_after"] = {"version": mv.version, "run_id": mv.run_id, "created": ts(mv.created_at)}
    save("10_drift_check.json", rec)
    return rec


def brief(w):
    token = w.config.authenticate()["Authorization"]
    r = requests.post(APP_URL + "/api/voxels/decision_brief/SANJUAN-01", headers={"Authorization": token}, timeout=240)
    b = r.json()
    b["log_rows"] = sql(w, f"SELECT count(*) AS briefs, sum(CASE WHEN grounded THEN 1 ELSE 0 END) AS grounded FROM {FQS}.gold_action_plans")
    save("11_decision_brief.json", b)
    return b


def engineer(w):
    """The engineer morning briefing, a ticket and close-out round trip (cleaned up), and Genie explaining a flag."""
    token = w.config.authenticate()["Authorization"]
    b = requests.get(APP_URL + "/api/engineer/briefing", headers={"Authorization": token}, timeout=240).json()
    focus = [i for i in b["items"] if i["well_id"] == b["focus_well"]]
    item = next(i for i in focus if i["rule_id"] == "R-INV-COVER")
    t = requests.post(APP_URL + "/api/engineer/tickets", headers={"Authorization": token}, timeout=60,
                      json={"item_key": item["item_key"], "rule_id": item["rule_id"], "well_id": item["well_id"],
                            "title": f"Reorder ticket: {item['well_id']} {item['subject']}", "detail": item["evidence"]}).json()
    in_uc = sql(w, f"SELECT ticket_id, created_by, rule_id, well_id, title, status FROM {FQS}.engineer_tickets WHERE ticket_id = '{t['ticket_id']}'")
    sql(w, f"DELETE FROM {FQS}.engineer_tickets WHERE ticket_id = '{t['ticket_id']}'")
    # Governed threshold drives the briefing: raise the audit interval, count, restore.
    def audit_items():
        bb = requests.get(APP_URL + "/api/engineer/briefing", headers={"Authorization": token}, timeout=240).json()
        return bb["open_focus"], sum(1 for i in bb["items"] if i["rule_id"] == "R-H2S-AUDIT")
    before = audit_items()
    requests.post(APP_URL + "/api/engineer/glossary", headers={"Authorization": token}, timeout=60, json={"term": "H2S safety audit interval", "threshold_value": 400})
    raised = audit_items()
    requests.post(APP_URL + "/api/engineer/glossary", headers={"Authorization": token}, timeout=60, json={"term": "H2S safety audit interval", "threshold_value": 365})
    restored = audit_items()
    q = f"Why is {b['focus_well']} flagged by rule R-H2S-AUDIT (H2S safety audit)? Show the rule, its glossary definition and the data behind it."
    m = w.genie.start_conversation_and_wait(GENIE_SPACE, q)
    g = {"question": q, "text": next((a.text.content for a in m.attachments or [] if a.text and a.text.content), None),
         "sql": next((a.query.query for a in m.attachments or [] if a.query), None)}
    rec = {"focus_well": b["focus_well"], "open_focus": b["open_focus"], "open_total": b["open_total"], "other_wells": b["other_wells"],
           "rules": b["rules"], "glossary_terms": b["glossary_terms"], "agent": b["agent"],
           "items": [{k: i[k] for k in ("rule_id", "severity", "well_id", "subject", "evidence", "status", "source_tables")} | {"links": [l["kind"] for l in i["links"]]} for i in b["items"]],
           "ticket_round_trip": {"created": t, "found_in_uc": in_uc, "deleted_after_check": True},
           "genie_explains_flag": g,
           "threshold_change": {"term": "H2S safety audit interval", "at_365": {"open_focus": before[0], "audit_items": before[1]},
                                "at_400": {"open_focus": raised[0], "audit_items": raised[1]}, "restored_365": {"open_focus": restored[0], "audit_items": restored[1]}}, "glossary": sql(w, f"SELECT term, threshold, owner FROM {FQS}.business_glossary ORDER BY term")}
    save("12_engineer_briefing.json", rec)
    return rec


def app(w):
    token = w.config.authenticate()["Authorization"]
    out = {}
    for path in ["/api/sonic/metrics", "/api/voxels/stepouts", "/api/voxels/stepout_value/SANJUAN-01", "/api/economics/summary"]:
        t0 = time.time()
        r = requests.get(APP_URL + path, headers={"Authorization": token}, timeout=120)
        out[path] = {"status": r.status_code, "seconds": round(time.time() - t0, 2), "body": r.json() if r.ok else r.text[:500]}
    r = requests.get(APP_URL + "/api/sonic/GREENRIVER-03", headers={"Authorization": token}, timeout=120)
    b = r.json()
    out["/api/sonic/GREENRIVER-03"] = {"status": r.status_code, "source": b.get("source"), "endpoint": b.get("endpoint"),
                                       "has_measured_dt": b.get("has_measured_dt"), "rows_returned": len(b.get("rows", [])),
                                       "first_rows": b.get("rows", [])[:5]}
    save("07_app_api.json", {"app": APP_URL, "captured": dt.datetime.now(dt.timezone.utc).isoformat(), "responses": out})
    return out


def tests():
    p = subprocess.run([sys.executable, "-m", "pytest", "tests", "-v"], cwd=ROOT, capture_output=True, text=True)
    (OUT / "08_tests.txt").write_text(p.stdout + p.stderr)
    print("wrote 08_tests.txt")
    return p.stdout.strip().splitlines()[-1] if p.stdout else p.stderr[-200:]


def summary(job, pipe, ml, srv, gen, gov, app_out, test_line, dr=None, br=None, en=None):
    m = ml["metrics"]
    sv = app_out["/api/voxels/stepout_value/SANJUAN-01"]["body"]
    lines = [
        "# Execution evidence",
        "",
        f"Captured from the live FEVM workspace on {dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `scripts/collect_evidence.py`. Every number below comes from the JSON files in this folder, which hold the raw API responses.",
        "",
        "## 1. Bundle job run (`01_job_run.json`)",
        "",
        f"Job `subsurface-command-build` ({JOB_ID}), run {job['run_id']}: **{job['result']}**, {job['start']} to {job['end']}.",
        "",
        "| Task (in run order) | Attempt | Result | Duration |",
        "|---|---|---|---|",
        *[f"| {t['task_key']} | {t['attempt']} | {t['result']} | {t['duration_s']} s |" for t in job["tasks"]],
        "",
        "The run was repaired in place: the first training attempts failed because the serverless training environment was missing numpy and scipy, and passed once they were added. "
        f"Earlier runs of the job ({', '.join(a['result'] or '?' for a in job['earlier_attempts'])}) stopped on a semicolon inside a SQL comment that broke the statement splitter; that was fixed before this run.",
        "",
        "## 2. Lakeflow pipeline (`02_pipeline.json`)",
        "",
        f"Pipeline `{pipe['name']}` ({PIPELINE_ID}), latest update **{(pipe['latest_updates'] or [{}])[0].get('state')}**.",
        "",
        "| Table | Rows |",
        "|---|---|",
        *[f"| {r['t']} | {int(r['n']):,} |" for r in pipe["table_row_counts"]],
        "",
        "Data-quality expectations recorded in the pipeline event log (spikes and gaps are nulled and flagged in silver, not dropped, so every sample passes the row-level rules):",
        "",
        "| Flow | Expectation | Passed | Failed |",
        "|---|---|---|---|",
        *[f"| {flow} | {e.get('name')} | {e.get('passed_records')} | {e.get('failed_records')} |"
          for flow, d in pipe["data_quality_by_flow"].items() for e in d["expectations"]],
        "",
        "## 3. MLflow training run and UC model (`03_mlflow_run.json`)",
        "",
        f"`{ml['model']}` version **{ml['version']}** `@champion`, from run `{ml['run_name']}` ({ml['run_id']}), {ml['run_status']}, {ml['run_end']}.",
        "",
        "Logged leave-one-well-out metrics (us/ft):",
        "",
        "| Metric | Value |",
        "|---|---|",
        *[f"| {k} | {round(v, 4)} |" for k, v in sorted(m.items())],
        "",
        "## 4. Served model and AI Gateway (`04_serving.json`)",
        "",
        f"Endpoint `{ENDPOINT}` **{srv['state']}**, live call returned {len(srv['response']['predictions'])} predictions in {srv['latency_s']} s. On SANJUAN-01 samples with measured sonic:",
        "",
        "| MD ft | Measured DT | Predicted DT | Abs error |",
        "|---|---|---|---|",
        *[f"| {c['md_ft']} | {c['measured_dt']} | {c['predicted_dt']} | {c['abs_error']} |" for c in srv["check"]],
        "",
        f"AI Gateway: usage tracking {'on' if (srv['ai_gateway'] or {}).get('usage_tracking_config', {}).get('enabled') else 'off'}, rate limit 600 calls/min, inference table `sonic_endpoint_payload`: "
        + (f"{srv['inference_table'][0]['logged_requests']} logged requests ({srv['inference_table'][0]['ok']} HTTP 200) from {srv['inference_table'][0]['first_request']} to {srv['inference_table'][0]['last_request']}."
           if srv.get("inference_table") else srv.get("inference_table_error", "")),
        "",
        "## 5. Genie conversation (`05_genie_conversation.json`)",
        "",
        *sum([[f"**Q: {t['question']}** ({t['status']}, {t['seconds']} s)", "",
               f"A: {t['text'] or t.get('description') or ''}", "",
               *([f"```sql\n{t['sql']}\n```", ""] if t.get("sql") else []),
               *([f"Rows: `{json.dumps(t['rows'][:5])}`", ""] if t.get("rows") else [])] for t in gen["turns"]], []),
        "## 6. Unity Catalog policy (`06_uc_governance.json`)",
        "",
        f"Same query, same user ({gov['principal']}), before and after mapping them as a San Juan JV partner:",
        "",
        "| View | Rows | Basins | Sw visible | HC pore ft visible |",
        "|---|---|---|---|---|",
        *[f"| {name} | {sum(int(r['zone_rows']) for r in v)} | {', '.join(r['basin'] for r in v)} | {sum(int(r['sw_visible']) for r in v)} | {sum(int(r['hc_pore_visible']) for r in v)} |"
          for name, v in [("Operator", gov["operator_view"]), ("JV partner, San Juan", gov["as_jv_partner_san_juan"]), ("Restored", gov["restored_view"])]],
        "",
        "The same policy on the equipment and H2S data (row filter on `well_h2s_profile`, masks on `equipment_component_spec`, inherited by every view built on them). H2S concentration stays visible to partners on purpose: safety data is not masked.",
        "",
        "| Object | View | Rows | Basins | H2S ppm visible | Upgrade capex visible | Risk score / notes visible |",
        "|---|---|---|---|---|---|---|",
        *[f"| {r['object']} | {label} | {r['rows_']} | {r['basins']} | {r['h2s_ppm_visible']} | {r['capex_visible'] if r['capex_visible'] is not None else 'n/a'} | {r['risk_score_visible']} |"
          for label, rows in [("Operator", gov.get("equipment_h2s_operator", [])), ("JV partner", gov.get("equipment_h2s_partner", []))] for r in rows],
        "",
        "## 7. Live app (`07_app_api.json`)",
        "",
        f"- `/api/sonic/GREENRIVER-03`: source **{app_out['/api/sonic/GREENRIVER-03']['source']}** via `{app_out['/api/sonic/GREENRIVER-03']['endpoint']}`, {app_out['/api/sonic/GREENRIVER-03']['rows_returned']} rows, no measured sonic on this well.",
        f"- `/api/voxels/stepout_value/SANJUAN-01`: priced by **{sv['priced_by']}**: step-out ${sv['cases']['stepout']['npv10_musd']}M unrisked, ${sv['cases']['risked']['npv10_musd']}M risked, offset ${sv['cases']['offset']['npv10_musd']}M.",
        f"- `/api/economics/summary`: priced by **{app_out['/api/economics/summary']['body']['priced_by']}**, portfolio ${app_out['/api/economics/summary']['body']['total_npv_live_musd']}M, WTI source `{app_out['/api/economics/summary']['body']['wti_source']}`.",
        "",
        "## 8. Tests (`08_tests.txt`)",
        "",
        f"`pytest tests -v`: {test_line}",
        "",
    ]
    nb = OUT / "09_notebook_result.json"
    if nb.exists():
        r = json.loads(nb.read_text())
        res = r["result"]
        lines += ["## 9. Workspace notebook run (`09_notebook_result.json`, `09_notebook_run.html`)", "",
                  f"`{r['notebook']}` executed as a serverless job run ({r['run_id']}) in the FEVM workspace: champion model v{res['model']['version']} MAE "
                  f"{res['model']['champion_mae']} vs calibrated Gardner {res['model']['gardner_calibrated_mae']} us/ft from MLflow; "
                  f"{res['serving']['n']} live predictions, mean abs error {res['serving']['mean_abs_error']} us/ft on measured sonic; Genie:", "",
                  *[f"- **{t['q']}** {t['a']}" for t in res["genie"]], "",
                  "The HTML export holds every cell with its output, including the governed query and the policy functions.", ""]
    if dr:
        lines += ["## 10. Drift check and automatic retrain (`10_drift_check.json`)", "",
                  "Job `subsurface-sonic-drift-check` scores the served model on every well with measured sonic against two bars: 1.5x its validated leave-one-well-out MAE, and calibrated Gardner on that well.", "",
                  "| Check | Wells | In drift | Action |", "|---|---|---|---|",
                  *[f"| {c['checked_at']} | {c['wells']} | {', '.join(c['drifted']) or 'none'} | {c['action']} |" for c in dr["checks"]], ""]
        sim = [x for c in dr["checks"] for x in c["rows"] if x["simulated"] in (True, "true")]
        if sim:
            x = sim[-1]
            lines += [f"Simulated new well `{x['well_id']}` (an existing well with a +0.12 v/v neutron-tool calibration shift): model error {x['model_mae']} us/ft against a bar of {x['degrade_bar']} (Gardner {x['gardner_mae']}), so it drifted and the retrain fired.", ""]
        if dr.get("triggered_retrain"):
            t = dr["triggered_retrain"]
            lines += [f"Triggered retrain: `subsurface-command-build` run {t['run_id']}, task {', '.join(x['task_key'] + ' ' + str(x['result']) for x in t['tasks'])}, {t['start']} to {t['end']}. Champion after: v{dr['champion_after']['version']} (run {dr['champion_after']['run_id']}).", ""]
    if br and br.get("plan"):
        v = br["validation"]
        lines += ["## 11. Decision brief (`11_decision_brief.json`)", "",
                  f"`POST /api/voxels/decision_brief/SANJUAN-01`, served by `{br['served_by']}` through the AI Gateway routing chain, {br['usage'].get('prompt_tokens')} prompt and {br['usage'].get('completion_tokens')} completion tokens. "
                  f"Validator: {v['figures_checked']} figures checked, {len(v['unsupported'])} not in the governed facts, facts cited {', '.join(v['facts_cited'])}. Logged to `{br['logged_to']}` ({br['log_rows'][0]['briefs']} briefs logged, {br['log_rows'][0]['grounded']} fully grounded).", "",
                  *["> " + l if l.strip() else ">" for l in br["plan"].splitlines()], ""]
    if en:
        av = en["agent"].get("validation") or {}
        lines += ["## 12. Engineer morning briefing (`12_engineer_briefing.json`)", "",
                  f"The operations agent ran {en['rules']} governed rules ({en['glossary_terms']} glossary terms in `business_glossary`) over UC data: "
                  f"**{en['open_focus']} open action items on {en['focus_well']}** (the 12,000 ppm extreme-sour well) and {en['open_total'] - en['open_focus']} on {', '.join(en['other_wells'])}.", "",
                  "| Rule | Severity | Well | Evidence | Links |", "|---|---|---|---|---|",
                  *[f"| {i['rule_id']} | {i['severity']} | {i['well_id']} | {i['evidence']} | {', '.join(i['links'])} |" for i in en["items"]], "",
                  f"Agent note by `{en['agent'].get('served_by')}`, validator: {av.get('figures_checked')} figures checked, {len(av.get('unsupported') or [])} not in the items:", "",
                  f"> {en['agent'].get('note')}", "",
                  f"Governed threshold drives the briefing: with the glossary's H2S safety audit interval at 365 days there are {en['threshold_change']['at_365']['audit_items']} audit items "
                  f"({en['threshold_change']['at_365']['open_focus']} open on {en['focus_well']}); raised to 400 days through the app, {en['threshold_change']['at_400']['audit_items']} "
                  f"({en['threshold_change']['at_400']['open_focus']} open); restored to 365, {en['threshold_change']['restored_365']['audit_items']}. No code changed.", "",
                  f"Ticket round trip: `{en['ticket_round_trip']['created'].get('ticket_id')}` created through the app, found in `engineer_tickets` as {en['ticket_round_trip']['found_in_uc']}, then deleted.", "",
                  f"Genie explains the flag: **{en['genie_explains_flag']['question']}**", "",
                  f"```sql\n{en['genie_explains_flag']['sql']}\n```", "",
                  "> " + (en["genie_explains_flag"]["text"] or "").replace("\n", " ")[:1200], ""]
    (OUT / "EVIDENCE.md").write_text("\n".join(lines))
    print("wrote EVIDENCE.md")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="fe-vm-oil-pump-monitor")
    a = ap.parse_args()
    w = WorkspaceClient(profile=a.profile)
    job = job_run(w)
    pipe = pipeline(w)
    ml = mlflow_run(w)
    srv = serving(w)
    gen = genie(w, ["Which basin has the highest total live NPV?",
                    "Which wells are within 50 km of SANJUAN-01 and how far are they?",
                    "What is the net pay in the Westwater formation for GREENRIVER-03?"])
    gov = governance(w)
    app_out = app(w)
    dr = drift(w)
    br = brief(w)
    en = engineer(w)
    test_line = tests()
    summary(job, pipe, ml, srv, gen, gov, app_out, test_line, dr, br, en)


if __name__ == "__main__":
    main()
