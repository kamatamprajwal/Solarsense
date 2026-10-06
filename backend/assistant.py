"""AI Maintenance Copilot: Gemini via emergentintegrations, grounded in live twin state."""
import json
import os
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import api as solarsense

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
router = APIRouter(prefix="/assistant")

SYSTEM_PROMPT = """You are SolarSense Copilot, an expert solar O&M (operations & maintenance) engineer.
You help operators of a 48-panel PV array (capacity in simulator.capacity_kw) monitored by an XGBoost yield model and DBSCAN anomaly detector.
Be concise, practical and use markdown (short headings, bullet lists, bold key numbers).
Ground every answer in the LIVE CONTEXT below. When diagnosing, give: likely root cause, evidence, recommended action, urgency.
LIVE CONTEXT (JSON):
{context}"""


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=4000)


class ChatMessage(BaseModel):
    session_id: str
    role: str
    content: str
    created_at: str


def live_context() -> str:
    panels = [p for p in solarsense.twin.panels if p["status"] != "healthy"]
    return json.dumps({
        "simulator": solarsense.twin.status(),
        "latest_telemetry": solarsense.live_telemetry[-6:],
        "recent_anomalies": solarsense.live_anomalies,
        "unhealthy_panels": panels,
    }, default=str)


async def history(session_id: str) -> list:
    docs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [ChatMessage(**d).model_dump() for d in docs]


async def save(session_id: str, role: str, content: str):
    msg = ChatMessage(session_id=session_id, role=role, content=content,
                      created_at=datetime.now(timezone.utc).isoformat())
    await db.chat_messages.insert_one(msg.model_dump())


@router.get("/history/{session_id}")
async def get_history(session_id: str):
    return await history(session_id)


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    await db.chat_messages.delete_many({"session_id": session_id})
    return {"cleared": True}


@router.post("/chat")
async def chat(req: ChatRequest):
    past = await history(req.session_id)
    transcript = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in past[-10:])
    prompt = f"Previous conversation:\n{transcript}\n\nUSER: {req.message}" if transcript else req.message
    await save(req.session_id, "user", req.message)

    llm = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=req.session_id,
                  system_message=SYSTEM_PROMPT.format(context=live_context())
                  ).with_model("gemini", "gemini-3-flash-preview")

    async def stream():
        full = []
        try:
            async for ev in llm.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        if full:
            await save(req.session_id, "assistant", "".join(full))
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
