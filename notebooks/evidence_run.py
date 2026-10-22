# Databricks notebook source
# MAGIC %md
# MAGIC # Subsurface Intelligence: execution evidence
# MAGIC
# MAGIC Runs in the workspace against the live build and prints what it finds: the champion model's logged MLflow metrics,
# MAGIC a live call to the served model, a Genie conversation over the governed tables, and the Unity Catalog policy in force.
# MAGIC The executed run is exported to `docs/evidence/notebook_run.html`.

# COMMAND ----------

# MAGIC %pip install -q "databricks-sdk>=0.40"

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import json, time
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import DataframeSplitInput

w = WorkspaceClient()
FQS = "oil_pump_monitor_catalog.subsurface_command"
SPACE = "01f17bdeaeee136fbd65013d3eb40261"
ENDPOINT = "subsurface-synthetic-sonic"
FEATURES = ["gr_api", "rhob_gcc", "nphi_vv", "log_rt", "md_ft", "zone_index"]
summary = {}

# COMMAND ----------

# MAGIC %md ## 1. Champion model and its leave-one-well-out metrics (MLflow + Unity Catalog)

# COMMAND ----------

mv = w.model_versions.get_by_alias(f"{FQS}.synthetic_sonic", "champion")
run = w.experiments.get_run(mv.run_id).run
metrics = {m.key: round(m.value, 3) for m in run.data.metrics}
print(f"Model {FQS}.synthetic_sonic v{mv.version} @champion, MLflow run {mv.run_id} ({run.info.status.value})")
for method in ["gardner_textbook", "gardner_calibrated", "faust_calibrated", "model", "linear_all_curves"]:
    print(f"  {method:22s} MAE {metrics[method + '_mae']:7.3f}  RMSE {metrics[method + '_rmse']:7.3f}  R2 {metrics[method + '_r2']:7.3f}")
summary["model"] = {"version": mv.version, "run_id": mv.run_id,
                    "champion_mae": metrics["linear_all_curves_mae"], "gardner_calibrated_mae": metrics["gardner_calibrated_mae"]}

# COMMAND ----------

# MAGIC %md ## 2. Live call to the served model (Model Serving behind AI Gateway)

# COMMAND ----------

df = spark.sql(f"""SELECT md_ft, {', '.join(FEATURES[:-2])}, zone_index, dt_usft FROM {FQS}.gold_sonic_features
                   WHERE well_id = 'SANJUAN-01' AND dt_usft IS NOT NULL ORDER BY md_ft LIMIT 10""").toPandas()
t0 = time.time()
resp = w.serving_endpoints.query(name=ENDPOINT, dataframe_split=DataframeSplitInput(
    columns=FEATURES, data=df[FEATURES].astype(float).assign(zone_index=df["zone_index"].astype(int)).values.tolist()))
df["predicted_dt"] = [round(float(p), 2) for p in resp.predictions]
df["abs_error"] = (df["dt_usft"] - df["predicted_dt"]).abs().round(2)
print(f"{len(df)} predictions in {time.time() - t0:.2f} s, mean abs error {df['abs_error'].mean():.2f} us/ft on measured sonic")
display(df[["md_ft", "dt_usft", "predicted_dt", "abs_error"]])
summary["serving"] = {"n": len(df), "mean_abs_error": round(float(df["abs_error"].mean()), 2)}

# COMMAND ----------

# MAGIC %md ## 3. Genie conversation over the governed tables

# COMMAND ----------

questions = ["Which basin has the highest total live NPV?",
             "Which wells are within 50 km of SANJUAN-01 and how far are they?",
             "What is the net pay in the Westwater formation for GREENRIVER-03?"]
conv, turns = None, []
for q in questions:
    m = (w.genie.start_conversation_and_wait(SPACE, q) if conv is None else w.genie.create_message_and_wait(SPACE, conv, q))
    conv = m.conversation_id
    text = next((a.text.content for a in m.attachments or [] if a.text and a.text.content), "")
    sql = next((a.query.query for a in m.attachments or [] if a.query), "")
    print(f"Q: {q}\nA: {text}\nSQL:\n{sql}\n" + "-" * 80)
    turns.append({"q": q, "a": text})
summary["genie"] = turns

# COMMAND ----------

# MAGIC %md ## 4. Unity Catalog policy in force on the gold table

# COMMAND ----------

display(spark.sql(f"SELECT current_user() AS me, {FQS}.is_jv_partner() AS jv_partner"))
display(spark.sql(f"""SELECT basin, count(*) AS zone_rows, count(avg_pay_sw) AS sw_visible, count(hc_pore_ft) AS hc_pore_visible
                      FROM {FQS}.gold_zone_summary GROUP BY basin ORDER BY basin"""))
display(spark.sql(f"""SELECT routine_name, comment FROM oil_pump_monitor_catalog.information_schema.routines
                      WHERE routine_schema = 'subsurface_command' AND routine_name IN ('is_jv_partner','basin_filter','mask_interpretation')"""))

# COMMAND ----------

dbutils.notebook.exit(json.dumps(summary))
