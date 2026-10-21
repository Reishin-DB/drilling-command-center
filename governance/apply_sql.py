"""
Run a SQL file statement by statement on a SQL warehouse.

    python governance/apply_sql.py governance/policies.sql \
        --schema oil_pump_monitor_catalog.subsurface_command \
        --warehouse 87e069097741b56c --profile fe-vm-oil-pump-monitor
"""
import argparse
import re

from databricks.sdk import WorkspaceClient


def statements(path: str, schema: str):
    sql = re.sub(r"--[^\n]*", "", open(path).read()).replace("${schema}", schema)
    return [s.strip() for s in sql.split(";") if s.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--schema", required=True)
    ap.add_argument("--warehouse", required=True)
    ap.add_argument("--profile")
    a = ap.parse_args()
    w = WorkspaceClient(profile=a.profile) if a.profile else WorkspaceClient()
    for s in statements(a.path, a.schema):
        r = w.statement_execution.execute_statement(warehouse_id=a.warehouse, statement=s, wait_timeout="50s")
        err = r.status.error.message if r.status.error else ""
        print(r.status.state.value, s.splitlines()[0][:80], err[:200])


if __name__ == "__main__":
    main()
