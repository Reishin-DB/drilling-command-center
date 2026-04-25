"""Genie Conversation API proxy."""
from __future__ import annotations

import asyncio
import os
import time
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

GENIE_SPACE_ID = os.getenv("GENIE_SPACE_ID", "01f13f7f8e201dc3bbf806bdba354f39")


class GenieReq(BaseModel):
    question: str
    conversation_id: str | None = None


def _client():
    from databricks.sdk import WorkspaceClient
    return WorkspaceClient()


def _msg_id_of(obj) -> str | None:
    """SDK shape varies between start_conversation (flat .message_id) and
    create_message (returns a GenieMessage with .id)."""
    for attr in ("message_id", "id"):
        v = getattr(obj, attr, None)
        if v:
            return str(v)
    if isinstance(obj, dict):
        return obj.get("message_id") or obj.get("id")
    return None


def _conv_id_of(obj, fallback: str | None) -> str | None:
    v = getattr(obj, "conversation_id", None)
    if v:
        return str(v)
    if isinstance(obj, dict):
        return obj.get("conversation_id") or fallback
    return fallback


def _ask_sync(question: str, conversation_id: str | None):
    w = _client()
    g = w.genie

    if conversation_id:
        resp = g.create_message(
            space_id=GENIE_SPACE_ID,
            conversation_id=conversation_id,
            content=question,
        )
        conv_id = _conv_id_of(resp, conversation_id)
    else:
        resp = g.start_conversation(
            space_id=GENIE_SPACE_ID,
            content=question,
        )
        conv_id = _conv_id_of(resp, None)

    msg_id = _msg_id_of(resp)
    if not conv_id or not msg_id:
        raise RuntimeError(f"Genie did not return ids: conv={conv_id} msg={msg_id} obj={resp!r}")

    # Poll for completion
    final = None
    for _ in range(60):
        m = g.get_message(
            space_id=GENIE_SPACE_ID,
            conversation_id=conv_id,
            message_id=msg_id,
        )
        final = m
        status = str(getattr(m, "status", "") or "").upper()
        if "COMPLETED" in status or "FAILED" in status or "CANCELLED" in status:
            break
        time.sleep(1)

    return _shape(conv_id, msg_id, final, w)


def _shape(conv_id, msg_id, m, w):
    text = ""
    sql = None
    rows: list = []
    cols: list[str] = []
    if m is None:
        return {"conversation_id": conv_id, "message_id": msg_id, "text": "(no response)", "sql": None, "columns": [], "rows": []}

    # Sometimes the message itself has top-level content
    top_content = getattr(m, "content", None)
    if top_content and isinstance(top_content, str):
        text = top_content

    for att in (getattr(m, "attachments", None) or []):
        # Text attachment (free-form answer)
        att_text = getattr(att, "text", None)
        if att_text:
            c = getattr(att_text, "content", None)
            if c:
                text = c

        # SQL query attachment
        att_query = getattr(att, "query", None)
        if att_query:
            sql = getattr(att_query, "query", None) or sql
            try:
                res = w.genie.get_message_query_result(
                    space_id=GENIE_SPACE_ID,
                    conversation_id=conv_id,
                    message_id=msg_id,
                )
                sr = getattr(res, "statement_response", None)
                if sr:
                    manifest = getattr(sr, "manifest", None)
                    schema = getattr(manifest, "schema", None) if manifest else None
                    if schema:
                        cols = [c.name for c in (getattr(schema, "columns", None) or [])]
                    result = getattr(sr, "result", None)
                    data = getattr(result, "data_array", None) if result else None
                    rows = data or []
            except Exception as e:
                print(f"Genie query result fetch failed: {e}")

    return {
        "conversation_id": conv_id,
        "message_id":      msg_id,
        "text":            text or "(Genie returned no text)",
        "sql":             sql,
        "columns":         cols,
        "rows":            rows[:200],
    }


@router.post("/genie/ask")
async def ask(req: GenieReq):
    try:
        return await asyncio.to_thread(_ask_sync, req.question, req.conversation_id)
    except Exception as e:
        import traceback
        print(f"Genie error: {e}\n{traceback.format_exc()[-600:]}")
        return {"error": str(e)}


@router.get("/genie/space")
async def space_info():
    return {
        "space_id": GENIE_SPACE_ID,
        "url": f"https://adb-4173618801742158.18.azuredatabricks.net/genie/rooms/{GENIE_SPACE_ID}",
        "name": "Subsurface Intelligence — OSDU",
    }
