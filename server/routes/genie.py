"""Genie conversation proxy. Uses the app SP (or user OBO via Databricks SDK)
to talk to the OSDU-backed Genie space."""
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


def _sdk():
    from databricks.sdk import WorkspaceClient
    return WorkspaceClient()


def _ask_sync(question: str, conversation_id: str | None):
    w = _sdk()
    g = w.genie
    if conversation_id:
        msg = g.create_message(
            space_id=GENIE_SPACE_ID,
            conversation_id=conversation_id,
            content=question,
        )
        conv_id = conversation_id
    else:
        started = g.start_conversation(
            space_id=GENIE_SPACE_ID,
            content=question,
        )
        msg = started.message
        conv_id = started.conversation_id

    # Poll for completion
    msg_id = msg.id if hasattr(msg, "id") else msg["id"]
    for _ in range(40):  # up to ~40s
        m = g.get_message(
            space_id=GENIE_SPACE_ID,
            conversation_id=conv_id,
            message_id=msg_id,
        )
        status = getattr(m, "status", None)
        if status and str(status).upper().endswith("COMPLETED"):
            break
        if status and str(status).upper().endswith("FAILED"):
            break
        time.sleep(1)

    return _shape(conv_id, msg_id, m)


def _shape(conv_id, msg_id, m):
    # Extract text answer + any SQL/result attachments
    text = ""
    sql = None
    rows = []
    cols = []
    for att in (m.attachments or []):
        if hasattr(att, "text") and att.text:
            payload = att.text
            c = getattr(payload, "content", None) or (payload.get("content") if isinstance(payload, dict) else None)
            if c:
                text = c
        if hasattr(att, "query") and att.query:
            q = att.query
            sql = getattr(q, "query", None) or (q.get("query") if isinstance(q, dict) else None)
            res = None
            try:
                from databricks.sdk import WorkspaceClient
                w = WorkspaceClient()
                res = w.genie.get_message_query_result(
                    space_id=GENIE_SPACE_ID,
                    conversation_id=conv_id,
                    message_id=msg_id,
                )
            except Exception as e:
                print(f"Genie query result fetch failed: {e}")
            if res and getattr(res, "statement_response", None):
                sr = res.statement_response
                schema = getattr(sr.manifest, "schema", None)
                if schema:
                    cols = [c.name for c in schema.columns]
                data = getattr(sr.result, "data_array", None) if sr.result else None
                rows = data or []
    return {
        "conversation_id": conv_id,
        "message_id": msg_id,
        "text": text,
        "sql": sql,
        "columns": cols,
        "rows": rows[:200],
    }


@router.post("/genie/ask")
async def ask(req: GenieReq):
    try:
        return await asyncio.to_thread(_ask_sync, req.question, req.conversation_id)
    except Exception as e:
        print(f"Genie error: {e}")
        return {"error": str(e)}


@router.get("/genie/space")
async def space_info():
    return {
        "space_id": GENIE_SPACE_ID,
        "url": f"https://adb-4173618801742158.18.azuredatabricks.net/genie/rooms/{GENIE_SPACE_ID}",
        "name": "Subsurface Intelligence — OSDU",
    }
