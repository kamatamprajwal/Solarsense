"""
Cleaning Schedule Planner.

1. Forecast daily energy for the next N days (XGBoost over projected weather).
2. Soiled panels (status soiled / last fault = Panel Soiling) lose (100 - health)% of their share, growing +0.4%/day.
3. For each candidate day: savings = lost energy from that day to horizon * tariff,
   net benefit = savings - crew cost. Rainy/overcast days (cloud > 75%) are unworkable.
4. Recommend the workable day with the highest net benefit.
"""
import uuid
from datetime import timedelta
from typing import List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import api as solarsense
from db import db

router = APIRouter(prefix="/maintenance")
SOILING_GROWTH_PER_DAY = 0.004
MAX_LOSS = 0.6
RAIN_CLOUD_PCT = 75


def forecast_days(days: int) -> List[dict]:
    twin, rows, meta = solarsense.twin, [], []
    for d in range(1, days + 1):
        date = (twin.sim_clock + timedelta(days=d)).date()
        rng = np.random.default_rng(date.toordinal())
        mean, swing, cloud = rng.uniform(18, 30), rng.uniform(6, 9), rng.uniform(0, 95)
        clouds = []
        for h in range(24):
            cloud = solarsense.physics.next_cloud_cover(cloud, rng)
            rows.append(solarsense.physics.simulate_conditions(h, mean, swing, cloud, twin.season, rng))
            if 7 <= h <= 17:
                clouds.append(cloud)
        meta.append({"date": date.isoformat(), "avg_cloud_pct": round(float(np.mean(clouds)), 1)})
    frame = pd.DataFrame(rows)[solarsense.FEATURES]
    preds = np.where(frame["solar_irradiance_w_m2"] > 0, np.clip(solarsense.model.predict(frame), 0, None), 0)
    for i, m in enumerate(meta):
        m["forecast_kwh"] = round(float(preds[i * 24:(i + 1) * 24].sum()), 2)
        m["peak_irradiance"] = round(float(frame["solar_irradiance_w_m2"][i * 24:(i + 1) * 24].max()), 0)
    return meta


@router.get("/cleaning-plan")
async def cleaning_plan(days: int = Query(7, ge=3, le=14), tariff: float = Query(0.12, gt=0, le=2),
                        cost_per_panel: float = Query(0.02, ge=0, le=100)):
    panels = [p for p in solarsense.twin.panels
              if p["health"] < 100 and (p["status"] == "soiled" or p["last_fault"] == "Panel Soiling")]
    loss0 = [min(MAX_LOSS, (100 - p["health"]) / 100) for p in panels]
    fc = forecast_days(days)
    n = solarsense.PANEL_COUNT

    # Energy lost per day if nobody cleans (soiling keeps accumulating).
    for k, day in enumerate(fc):
        frac = sum(min(MAX_LOSS, l + SOILING_GROWTH_PER_DAY * (k + 1)) for l in loss0) / n
        day["lost_kwh_if_uncleaned"] = round(day["forecast_kwh"] * frac, 3)
        day["rain_likely"] = day["avg_cloud_pct"] > RAIN_CLOUD_PCT
        day["workable"] = not day["rain_likely"]

    cost = round(len(panels) * cost_per_panel, 2)
    for k, day in enumerate(fc):
        saved = sum(d["lost_kwh_if_uncleaned"] for d in fc[k:])
        day["savings_usd"] = round(saved * tariff, 3)
        day["net_benefit_usd"] = round(saved * tariff - cost, 3)

    workable = [d for d in fc if d["workable"]]
    best = max(workable, key=lambda d: d["net_benefit_usd"], default=None)
    for d in fc:
        d["recommended"] = bool(panels) and best is not None and d is best and best["net_benefit_usd"] > 0

    if not panels:
        message = "No soiled or degrading panels - no cleaning needed this period."
    elif best is None:
        message = "Every forecast day is overcast/rainy - postpone cleaning."
    elif best["net_benefit_usd"] <= 0:
        message = f"Cleaning cost (${cost}) exceeds recoverable revenue - wait for more soiling."
    else:
        message = f"Clean {len(panels)} panel(s) on {best['date']}: recovers ${best['savings_usd']} for ${cost} crew cost."

    return {
        "sim_date": solarsense.twin.sim_clock.date().isoformat(),
        "horizon_days": days, "tariff": tariff, "cost_per_panel": cost_per_panel, "crew_cost_usd": cost,
        "candidates": [{"panel_id": p["panel_id"], "health": p["health"], "status": p["status"],
                        "last_fault": p["last_fault"], "loss_pct": round(l * 100, 1)}
                       for p, l in sorted(zip(panels, loss0), key=lambda x: -x[1])],
        "total_loss_no_action_usd": round(sum(d["lost_kwh_if_uncleaned"] for d in fc) * tariff, 3),
        "days": fc,
        "recommendation": {"date": best["date"] if best and best["net_benefit_usd"] > 0 and panels else None,
                           "message": message},
    }


class JobCreate(BaseModel):
    date: str = Field(..., min_length=10, max_length=10)
    panel_ids: List[str] = Field(..., min_length=1, max_length=48)


class Job(JobCreate):
    id: str
    status: str
    created_at: str
    completed_at: str | None = None


@router.post("/jobs")
async def create_job(body: JobCreate):
    valid = {p["panel_id"] for p in solarsense.twin.panels}
    if not set(body.panel_ids) <= valid:
        raise HTTPException(400, "Unknown panel id")
    job = Job(**body.model_dump(), id=str(uuid.uuid4()), status="scheduled",
              created_at=solarsense.twin.sim_clock.isoformat())
    await db.cleaning_jobs.insert_one(job.model_dump())
    return job.model_dump()


@router.get("/jobs")
async def list_jobs():
    docs = await db.cleaning_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [Job(**d).model_dump() for d in docs]


@router.post("/jobs/{job_id}/complete")
async def complete_job(job_id: str):
    doc = await db.cleaning_jobs.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")
    for pid in doc["panel_ids"]:
        solarsense.twin.service_panel(pid)
    done = solarsense.twin.sim_clock.isoformat()
    await db.cleaning_jobs.update_one({"id": job_id}, {"$set": {"status": "completed", "completed_at": done}})
    return Job(**{**doc, "status": "completed", "completed_at": done}).model_dump()
