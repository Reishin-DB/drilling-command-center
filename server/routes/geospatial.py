"""Geospatial GA panel — real Databricks spatial SQL over operator_wells.

Surfaces H3 indexing + ST_ spatial joins (GA) against the live OSDU well set:
  1. H3 index        — h3_longlatash3 cell per well (co-located wells share a cell)
  2. Basin AOI join  — wells inside a basin polygon via ST_Contains
  3. Nearest wells   — offset wells within range via ST_Distance (certified UC function)
"""
import os
from fastapi import APIRouter

router = APIRouter()

CATALOG = os.getenv("ADME_CATALOG", "adme_adb_sbx_scus_dbx_ws_1")
SCHEMA = os.getenv("ADME_SCHEMA", "adme_client_demo")
WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "186af4be97756033")
TBL = f"`{CATALOG}`.`{SCHEMA}`.operator_wells"
FQS = f"{CATALOG}.{SCHEMA}"

# Permian Basin area-of-interest (WKT) for the ST_Contains demo.
PERMIAN_AOI = "POLYGON((-103.2 29.5, -100.5 29.5, -100.5 33.2, -103.2 33.2, -103.2 29.5))"

QUERIES = [
    {
        "key": "h3_index",
        "title": "H3 index",
        "description": "Each well mapped to an H3 resolution-5 cell — co-located wells share a cell.",
        "sql": (
            f"SELECT well_id, well_name, basin,\n"
            f"       h3_longlatash3(lon, lat, 5) AS h3_cell\n"
            f"FROM {FQS}.operator_wells\n"
            f"WHERE lat IS NOT NULL\n"
            f"ORDER BY h3_cell"
        ),
    },
    {
        "key": "basin_aoi",
        "title": "Basin AOI join",
        "description": "Wells inside the Permian Basin polygon via ST_Contains — spatial validation of the basin label.",
        "sql": (
            f"SELECT well_id, well_name, basin\n"
            f"FROM {FQS}.operator_wells\n"
            f"WHERE lat IS NOT NULL\n"
            f"  AND ST_Contains(ST_GeomFromText('{PERMIAN_AOI}'), ST_Point(lon, lat))\n"
            f"ORDER BY well_id"
        ),
    },
    {
        "key": "nearest_wells",
        "title": "Nearest offset wells",
        "description": "Certified function f_wells_within_km — offset wells within 500 km of BAKER-001 by ST_Distance.",
        "sql": f"SELECT * FROM {FQS}.f_wells_within_km('BAKER-001', 500)",
    },
]


def _wh_query(sql: str):
    from databricks import sql as dbsql
    from databricks.sdk.core import Config
    cfg = Config()
    host = (os.getenv("DATABRICKS_HOST") or cfg.host or "").replace("https://", "").rstrip("/")
    with dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
    ) as c, c.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall_arrow().to_pylist()


@router.get("/geospatial/spatial-sql")
async def spatial_sql():
    out = []
    for q in QUERIES:
        try:
            rows = _wh_query(q["sql"])
            out.append({**q, "rows": rows, "error": None})
        except Exception as e:
            out.append({**q, "rows": [], "error": str(e)[:200]})
    return {
        "source": f"{FQS}.operator_wells",
        "functions": ["h3_longlatash3", "ST_Point", "ST_Contains", "ST_GeomFromText", "ST_Distance", "f_wells_within_km"],
        "results": out,
    }
