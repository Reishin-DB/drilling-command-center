"""Drilling journal + alerts — real Lakebase Postgres writes via Databricks
Apps database resource binding."""
from fastapi import APIRouter
from pydantic import BaseModel

from .. import lakebase

router = APIRouter()


class JournalEntry(BaseModel):
    well_id: str
    author: str = "operator"
    depth_md: float | None = None
    note: str


@router.post("/journal")
async def add_entry(e: JournalEntry):
    await lakebase.execute(
        "INSERT INTO dcc.journal (well_id, author, depth_md, note) VALUES ($1,$2,$3,$4)",
        e.well_id, e.author, e.depth_md, e.note,
    )
    return {"status": "ok"}


@router.get("/journal/{well_id}")
async def list_entries(well_id: str, limit: int = 20):
    rows = await lakebase.fetch(
        "SELECT entry_id, well_id, author, depth_md, note, ai_summary, "
        "       to_char(entered_ts, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS entered_ts "
        "FROM dcc.journal WHERE well_id = $1 ORDER BY entered_ts DESC LIMIT $2",
        well_id, limit,
    )
    return rows


@router.get("/journal")
async def list_all(limit: int = 20):
    rows = await lakebase.fetch(
        "SELECT entry_id, well_id, author, depth_md, note, "
        "       to_char(entered_ts, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS entered_ts "
        "FROM dcc.journal ORDER BY entered_ts DESC LIMIT $1",
        limit,
    )
    return rows


@router.get("/journal/status/health")
async def lakebase_health():
    pool = await lakebase.get_pool()
    if pool is None:
        return {"status": "unavailable", "backend": "none"}
    try:
        rows = await lakebase.fetch("SELECT current_database() AS db, current_user AS role, now() AS ts")
        return {"status": "ok", "backend": "lakebase", **(rows[0] if rows else {})}
    except Exception as e:
        return {"status": "error", "backend": "lakebase", "error": str(e)}
