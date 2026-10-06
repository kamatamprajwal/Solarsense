"""
Anomaly History Log: every fault the digital twin raises is persisted to MongoDB.

Flow: twin.emit(event) -> listener() -> asyncio.Queue -> consume() -> Mongo
Events: "anomaly" (insert), "ack" (mark acknowledged), "service" (resolve open faults on the panel).
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

import alerts
from db import db

logger = logging.getLogger("history")
router = APIRouter(prefix="/history")
queue: asyncio.Queue = asyncio.Queue()


class AnomalyRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    panel_id: str
    type: str
    severity: str
    drop_pct: float
    timestamp: str
    hour_of_day: int
    expected_yield_kwh: float
    actual_yield_kwh: float
    efficiency_residual: float
    lost_revenue_usd: float
    module_temp_c: float
    irradiance: float
    acknowledged: bool = False
    resolved: bool = False
    resolved_at: Optional[str] = None
    emailed: bool = False
    recorded_at: str


def listener(event: str, payload: dict) -> None:
    queue.put_nowait((event, payload))


async def consume() -> None:
    while True:
        event, p = await queue.get()
        try:
            if event == "anomaly":
                rec = AnomalyRecord(**p, recorded_at=datetime.now(timezone.utc).isoformat())
                await db.anomaly_history.insert_one(rec.model_dump())
                alerts.enqueue(rec.model_dump())
            elif event == "ack":
                await db.anomaly_history.update_one({"id": p["id"]}, {"$set": {"acknowledged": True}})
            elif event == "service":
                await db.anomaly_history.update_many(
                    {"panel_id": p["panel_id"], "resolved": False},
                    {"$set": {"resolved": True, "acknowledged": True, "resolved_at": p["last_serviced"]}})
        except Exception:
            logger.exception("history event %s failed", event)


def _filter(panel_id, type_, severity, status) -> dict:
    q = {}
    if panel_id:
        q["panel_id"] = panel_id.upper()
    if type_:
        q["type"] = type_
    if severity:
        q["severity"] = severity
    if status == "open":
        q.update(acknowledged=False, resolved=False)
    elif status == "acknowledged":
        q.update(acknowledged=True, resolved=False)
    elif status == "resolved":
        q["resolved"] = True
    return q


@router.get("/anomalies")
async def list_anomalies(panel_id: Optional[str] = None, type: Optional[str] = None,
                         severity: Optional[str] = None, status: Optional[str] = None,
                         limit: int = Query(25, ge=1, le=5000), skip: int = Query(0, ge=0)):
    q = _filter(panel_id, type, severity, status)
    total = await db.anomaly_history.count_documents(q)
    docs = await db.anomaly_history.find(q, {"_id": 0}).sort("recorded_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": [AnomalyRecord(**d).model_dump() for d in docs]}


@router.get("/stats")
async def stats():
    col = db.anomaly_history

    async def group(field, limit=20):
        rows = await col.aggregate([{"$group": {"_id": f"${field}", "count": {"$sum": 1},
                                                "lost": {"$sum": "$lost_revenue_usd"}}},
                                    {"$sort": {"count": -1}}, {"$limit": limit}]).to_list(limit)
        return [{"key": r["_id"], "count": r["count"], "lost_usd": round(r["lost"], 3)} for r in rows]

    total = await col.count_documents({})
    lost = await col.aggregate([{"$group": {"_id": None, "s": {"$sum": "$lost_revenue_usd"}}}]).to_list(1)
    days = await col.aggregate([{"$group": {"_id": {"$substr": ["$timestamp", 0, 10]}, "count": {"$sum": 1}}},
                                {"$sort": {"_id": -1}}, {"$limit": 14}]).to_list(14)
    return {
        "total": total,
        "open": await col.count_documents({"acknowledged": False, "resolved": False}),
        "resolved": await col.count_documents({"resolved": True}),
        "critical": await col.count_documents({"severity": "critical"}),
        "lost_revenue_usd": round(lost[0]["s"], 2) if lost else 0,
        "by_type": await group("type"),
        "top_panels": await group("panel_id", 8),
        "by_day": [{"day": d["_id"], "count": d["count"]} for d in reversed(days)],
    }
