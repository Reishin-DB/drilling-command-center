# Deploying Subsurface Intelligence

Two parts: the data and ML layer (a Databricks Asset Bundle) and the app (a Databricks App).

## Prerequisites

- Databricks CLI, authenticated to the target workspace (`fe-vm-oil-pump-monitor` in the reference build)
- A serverless SQL warehouse, Unity Catalog, Model Serving, and Databricks Apps enabled
- Node 18+ to build the frontend

## 1. Data, pipeline, model

```bash
databricks bundle deploy -t fevm
databricks bundle run build -t fevm      # land raw -> UC policies -> SDP pipeline -> train, register, serve, score
python genie/update_space.py --profile fe-vm-oil-pump-monitor
```

This creates the UC volume, the bronze/silver/gold tables in `oil_pump_monitor_catalog.subsurface_command`, the `synthetic_sonic@champion` model, the `subsurface-synthetic-sonic` endpoint behind AI Gateway, and the row filter and column masks.

## 2. Grants for the app service principal

Use the app SP's **application_id** (not its OAuth client id):

- `USE CATALOG`, `USE SCHEMA`, `SELECT`, `EXECUTE` on the schema
- `MODIFY` on `access_personas` only (the Governance tab's JV-partner toggle)
- `CAN_QUERY` on the `subsurface-synthetic-sonic` endpoint
- `CAN_USE` on the warehouse and `CAN_RUN` on the Genie space

## 3. The app

```bash
cd frontend && npm install && npm run build && cd ..
rm -rf _deploy && mkdir -p _deploy/frontend
cp app.py requirements.txt _deploy/ && cp app.fevm.yaml _deploy/app.yaml
rsync -a --exclude __pycache__ server _deploy/ && cp -R frontend/dist _deploy/frontend/ && cp -R icons _deploy/
databricks workspace import-dir _deploy /Workspace/Users/<you>/subsurface-command --overwrite
databricks apps deploy subsurface-command --source-code-path /Workspace/Users/<you>/subsurface-command
```

Deploy from the clean `_deploy/` copy: `import-dir` does not prune old files. The app seeds its in-process DuckDB on startup (about a minute) and reads `ADME_CATALOG`, `ADME_SCHEMA`, `DATABRICKS_WAREHOUSE_ID`, `GENIE_SPACE_ID`, `GENIE_HOST`, `VS_ENDPOINT`, `VS_INDEX` and `SONIC_ENDPOINT` from `app.fevm.yaml`. `user_api_scopes` (`sql`, `dashboards.genie`) give the Governance tab and Genie the signed-in user's identity.

## 4. Before a demo

Warm the sonic endpoint (open *Fill the Missing Sonic* once), open the app in a fresh browser window so the session carries the `sql` scope, and follow the pre-flight list in `docs/TALK-TRACK.md`.
