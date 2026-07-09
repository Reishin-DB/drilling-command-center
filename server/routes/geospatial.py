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

# Cushing, OK — the WTI physical pricing/settlement hub.
CUSHING = (-96.7686, 35.9848)

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
        "title": "Basin lease footprint",
        "description": "Tight AOI per basin — buffered convex hull of the wells (ST_ConvexHull + ST_Buffer) with acreage (ST_Area). No hardcoded box.",
        "sql": (
            f"SELECT basin, count(*) AS wells,\n"
            f"       round(ST_Area(ST_Buffer(ST_ConvexHull(ST_Union_Agg(ST_Point(lon,lat))),0.18))*111.0*111.0) AS km2\n"
            f"FROM {FQS}.operator_wells\n"
            f"WHERE lat IS NOT NULL AND basin IS NOT NULL\n"
            f"GROUP BY basin ORDER BY wells DESC"
        ),
    },
    {
        "key": "well_spacing",
        "title": "Well spacing (nearest offset)",
        "description": "Nearest offset well for each well via ST_Distance — spacing / anti-collision.",
        "sql": (
            f"SELECT a.well_id, b.well_id AS nearest, round(ST_Distance(ST_Point(a.lon,a.lat),ST_Point(b.lon,b.lat))*111.0,1) AS km\n"
            f"FROM {FQS}.operator_wells a JOIN {FQS}.operator_wells b ON a.well_id <> b.well_id\n"
            f"WHERE a.lat IS NOT NULL AND b.lat IS NOT NULL\n"
            f"QUALIFY row_number() OVER (PARTITION BY a.well_id ORDER BY ST_Distance(ST_Point(a.lon,a.lat),ST_Point(b.lon,b.lat)))=1"
        ),
    },
    {
        "key": "hub_distance",
        "title": "Distance to Cushing hub",
        "description": "Great-circle distance from each well to the Cushing, OK WTI pricing hub (ST_Distance) — takeaway / market proximity.",
        "sql": (
            f"SELECT well_id, basin,\n"
            f"       round(ST_Distance(ST_Point(lon,lat), ST_Point({CUSHING[0]},{CUSHING[1]}))*111.0,0) AS km_to_cushing\n"
            f"FROM {FQS}.operator_wells\n"
            f"WHERE lat IS NOT NULL\n"
            f"ORDER BY km_to_cushing"
        ),
    },
    {
        "key": "nearest_wells",
        "title": "Nearest offset wells (fn)",
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


@router.get("/geospatial/aoi")
async def basin_aoi():
    """Tight per-basin AOI footprints that hug the actual wells — a buffered convex
    hull (ST_ConvexHull + ST_Buffer) with acreage (ST_Area). Replaces a hardcoded box."""
    import json as _json
    try:
        rows = _wh_query(
            f"SELECT basin, count(*) AS n, "
            f"  round(ST_Area(ST_Buffer(ST_ConvexHull(ST_Union_Agg(ST_Point(lon,lat))),0.18))*111.0*111.0) AS km2, "
            f"  ST_AsGeoJSON(ST_Buffer(ST_ConvexHull(ST_Union_Agg(ST_Point(lon,lat))),0.18)) AS gj, "
            f"  ST_AsGeoJSON(ST_Centroid(ST_Union_Agg(ST_Point(lon,lat)))) AS ctr "
            f"FROM {FQS}.operator_wells WHERE lat IS NOT NULL AND basin IS NOT NULL GROUP BY basin ORDER BY n DESC"
        )
        feats = []
        for r in rows:
            try:
                g = _json.loads(r["gj"]); ctr = _json.loads(r["ctr"])
                ring = g.get("coordinates", [[]])[0]
                feats.append({"basin": r["basin"], "wells": int(r["n"]), "km2": int(float(r["km2"])),
                              "ring": ring, "centroid": ctr.get("coordinates")})
            except Exception:
                pass
        return {"features": feats, "method": "ST_Buffer(ST_ConvexHull(ST_Union_Agg(ST_Point))) + ST_Area"}
    except Exception as e:
        return {"features": [], "error": str(e)[:200]}


@router.get("/geospatial/spacing")
async def well_spacing():
    """Nearest-offset well per well via ST_Distance — well spacing / anti-collision."""
    try:
        rows = _wh_query(
            f"SELECT a.well_id, a.lon AS flon, a.lat AS flat, b.well_id AS nn, b.lon AS tlon, b.lat AS tlat, "
            f"  round(ST_Distance(ST_Point(a.lon,a.lat), ST_Point(b.lon,b.lat))*111.0,1) AS km "
            f"FROM {FQS}.operator_wells a JOIN {FQS}.operator_wells b ON a.well_id <> b.well_id "
            f"WHERE a.lat IS NOT NULL AND b.lat IS NOT NULL "
            f"QUALIFY row_number() OVER (PARTITION BY a.well_id ORDER BY ST_Distance(ST_Point(a.lon,a.lat),ST_Point(b.lon,b.lat)))=1"
        )
        pairs = [{"well_id": r["well_id"], "nn": r["nn"], "km": float(r["km"]),
                  "from": [float(r["flon"]), float(r["flat"])], "to": [float(r["tlon"]), float(r["tlat"])]}
                 for r in rows]
        return {"pairs": pairs, "method": "ST_Distance nearest-neighbor"}
    except Exception as e:
        return {"pairs": [], "error": str(e)[:200]}


@router.get("/geospatial/buffers")
async def spacing_buffers():
    """~11 km spacing/interference buffer around each well (ST_Buffer). Overlapping
    buffers flag wells close enough to interfere."""
    import json as _json
    try:
        rows = _wh_query(
            f"SELECT well_id, basin, ST_AsGeoJSON(ST_Buffer(ST_Point(lon,lat), 0.10)) AS gj "
            f"FROM {FQS}.operator_wells WHERE lat IS NOT NULL"
        )
        feats = []
        for r in rows:
            try:
                ring = _json.loads(r["gj"]).get("coordinates", [[]])[0]
                feats.append({"well_id": r["well_id"], "basin": r["basin"], "ring": ring})
            except Exception:
                pass
        return {"features": feats, "radius_km": 11, "method": "ST_Buffer(ST_Point, 0.10)"}
    except Exception as e:
        return {"features": [], "error": str(e)[:200]}


@router.get("/geospatial/h3-surface")
async def h3_surface():
    """H3 res-4 hexagons over the operator wells, as lat/lon rings + well count,
    for draping on the 3D viewer's surface plane (h3_longlatash3 + h3_boundaryasgeojson)."""
    import json as _json
    try:
        rows = _wh_query(
            f"SELECT h3_boundaryasgeojson(cell) AS gj, wells FROM ("
            f"  SELECT h3_longlatash3(lon, lat, 4) AS cell, count(*) AS wells "
            f"  FROM {FQS}.operator_wells WHERE lat IS NOT NULL GROUP BY 1)"
        )
        feats = []
        for r in rows:
            try:
                g = _json.loads(r["gj"])
                ring = g.get("coordinates", [[]])[0]
                feats.append({"ring": ring, "wells": int(r["wells"])})
            except Exception:
                pass
        return {"features": feats, "resolution": 4, "sql": "h3_longlatash3(lon,lat,4) + h3_boundaryasgeojson(cell)"}
    except Exception as e:
        return {"features": [], "error": str(e)[:200]}


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
