"""
SolarSense - Task 4: FastAPI Digital Twin Simulator.

Architecture
------------
  +-------------------+   every tick (3s / speed)   +-----------------------+
  | Simulated clock   | --------------------------> | Weather model (physics)|
  +-------------------+                             +-----------+-----------+
                                                                |
                                                    XGBoost expected_yield_kwh
                                                                |
                                     actual = expected * U(0.97, 1.02)
                                     8% -> severe anomaly (-40..-60%)
                                                                |
                         live_telemetry (rolling 24) / live_anomalies (last 8)
                                                                |
                                                  REST endpoints (this router)

This module exposes:
  * `router`   - APIRouter with all simulator endpoints (mounted at "/" here and
                 at "/api" by the main platform backend).
  * `twin`     - the DigitalTwin singleton (start/stop the loop, inspect state).
  * `app`      - a standalone FastAPI app:  uvicorn api:app --app-dir src
"""

import asyncio
import json
import os
import random
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Absolute path resolution - works from any working directory.
# ---------------------------------------------------------------------------
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)
MODEL_PATH = os.path.join(PROJECT_DIR, "models", "xgboost_yield_model.pkl")
METRICS_PATH = os.path.join(PROJECT_DIR, "models", "model_metrics.json")
DBSCAN_PATH = os.path.join(PROJECT_DIR, "data", "dbscan_results.json")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import generate_mock_data as physics  # noqa: E402  (shared weather physics)

FEATURES = ["hour_of_day", "ambient_temp_c", "module_temp_c",
            "solar_irradiance_w_m2", "cloud_cover_pct"]
BASE_TICK_SECONDS = 3.0
TELEMETRY_WINDOW = 24
ANOMALY_WINDOW = 8
PANEL_COUNT = 48
ANOMALY_TYPES = ["Panel Soiling", "Inverter Failure", "Hot-Spot", "String Disconnect", "Partial Shading"]
TARIFF_USD_PER_KWH = 0.12
CO2_KG_PER_KWH = 0.42

# ---------------------------------------------------------------------------
# Global in-memory state (as required by the spec).
# ---------------------------------------------------------------------------
live_telemetry: List[dict] = []
live_anomalies: List[dict] = []
model = None

# Event hooks: the platform backend subscribes to persist history / send alerts.
# Each listener is a sync callable(event_name, payload) and must not block.
event_listeners: List = []


def emit(event: str, payload: dict) -> None:
    for listener in event_listeners:
        listener(event, dict(payload))


def ensure_artifacts() -> None:
    """Bootstrap: train pipelines if the model / analysis artifacts are missing."""
    if not os.path.exists(MODEL_PATH) or not os.path.exists(METRICS_PATH):
        import supervised_xgboost
        if not os.path.exists(supervised_xgboost.INPUT_CSV):
            physics.main()
        supervised_xgboost.train()
    if not os.path.exists(DBSCAN_PATH):
        import unsupervised_dbscan
        unsupervised_dbscan.run()


capacity_kw = physics.ARRAY_CAPACITY_KW


def load_model():
    """Load the trained XGBoost model with joblib (called on startup)."""
    global model, capacity_kw
    ensure_artifacts()
    model = joblib.load(MODEL_PATH)
    # Array size is inferred from the training data so KPIs match the dataset's scale.
    with open(METRICS_PATH) as fh:
        capacity_kw = json.load(fh).get("capacity_kw_est", physics.ARRAY_CAPACITY_KW)
    return model


def predict_yield(features: dict) -> float:
    """Run a single feature dict through the XGBoost model (kWh, clipped >= 0)."""
    frame = pd.DataFrame([[features[f] for f in FEATURES]], columns=FEATURES)
    value = float(model.predict(frame)[0])
    return 0.0 if features["solar_irradiance_w_m2"] <= 0 else max(0.0, value)


class DigitalTwin:
    """Owns simulator configuration, the panel fleet and the async tick loop."""

    def __init__(self):
        self.task: Optional[asyncio.Task] = None
        self.paused = False
        self.speed = 1.0
        self.anomaly_rate = 0.08
        self.force_next = False
        self.reset()

    # ----------------------------------------------------------------- state
    def reset(self):
        live_telemetry.clear()
        live_anomalies.clear()
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        self.sim_clock = now.replace(hour=5)
        self.tick_count = 0
        self.total_energy_kwh = 0.0
        self.total_expected_kwh = 0.0
        self.total_anomalies = 0
        self.started_at = datetime.now(timezone.utc)
        self.cloud = random.uniform(10, 40)
        self._new_day()
        self.panels = [{"panel_id": f"P-{i + 1}", "row": i // 8, "col": i % 8,
                        "health": round(random.uniform(94, 100), 1), "status": "healthy",
                        "last_fault": None, "fault_count": 0, "last_serviced": None}
                       for i in range(PANEL_COUNT)]

    def _new_day(self):
        self.daily_mean = random.uniform(16, 28)
        self.daily_swing = random.uniform(6, 9)
        self.season = random.uniform(0.9, 1.0)

    # ----------------------------------------------------------------- tick
    def tick(self) -> dict:
        """Advance the simulated clock by one hour and generate a data point."""
        self.sim_clock += timedelta(hours=1)
        hour = self.sim_clock.hour
        if hour == 0:
            self._new_day()
        self.tick_count += 1

        rng = np.random.default_rng()
        self.cloud = physics.next_cloud_cover(self.cloud, rng)
        cond = physics.simulate_conditions(hour, self.daily_mean, self.daily_swing,
                                           self.cloud, self.season, rng)

        expected = predict_yield(cond)
        actual = expected * random.uniform(0.97, 1.02)

        # Anomaly injection: only meaningful while the array is producing power.
        anomaly = None
        daylight = cond["solar_irradiance_w_m2"] > 10 and expected > 0.5
        if daylight and (self.force_next or random.random() < self.anomaly_rate):
            self.force_next = False
            drop = random.uniform(0.40, 0.60)
            actual *= (1 - drop)
            anomaly = self._register_anomaly(cond, expected, actual, drop)

        residual = actual - expected
        self.total_energy_kwh += actual
        self.total_expected_kwh += expected
        point = {
            "id": str(uuid.uuid4()),
            "tick": self.tick_count,
            "timestamp": self.sim_clock.isoformat(),
            "wall_time": datetime.now(timezone.utc).isoformat(),
            **cond,
            "expected_yield_kwh": round(expected, 3),
            "actual_yield_kwh": round(actual, 3),
            "efficiency_residual": round(residual, 3),
            "efficiency_pct": round(100 * actual / expected, 1) if expected > 0.05 else None,
            "is_anomaly": anomaly is not None,
            "anomaly_panel": anomaly["panel_id"] if anomaly else None,
        }
        live_telemetry.append(point)
        del live_telemetry[:-TELEMETRY_WINDOW]
        self._recover_panels()
        return point

    def _register_anomaly(self, cond, expected, actual, drop) -> dict:
        panel = random.choice(self.panels)
        kind = random.choice(ANOMALY_TYPES)
        panel["health"] = round(max(5.0, panel["health"] - drop * 100 * random.uniform(0.5, 0.9)), 1)
        panel["fault_count"] += 1
        panel["last_fault"] = kind
        panel["status"] = self._status_for(panel["health"], kind)
        self.total_anomalies += 1
        anomaly = {
            "id": str(uuid.uuid4()),
            "panel_id": panel["panel_id"],
            "type": kind,
            "severity": "critical" if drop >= 0.5 else "high",
            "drop_pct": round(drop * 100, 1),
            "timestamp": self.sim_clock.isoformat(),
            "hour_of_day": cond["hour_of_day"],
            "expected_yield_kwh": round(expected, 3),
            "actual_yield_kwh": round(actual, 3),
            "efficiency_residual": round(actual - expected, 3),
            "lost_revenue_usd": round((expected - actual) * TARIFF_USD_PER_KWH, 3),
            "module_temp_c": cond["module_temp_c"],
            "irradiance": cond["solar_irradiance_w_m2"],
            "acknowledged": False,
        }
        live_anomalies.append(anomaly)
        del live_anomalies[:-ANOMALY_WINDOW]
        emit("anomaly", anomaly)
        return anomaly

    @staticmethod
    def _status_for(health: float, kind: Optional[str]) -> str:
        if health < 50:
            return "faulted"
        if kind == "Panel Soiling" and health < 85:
            return "soiled"
        if health < 85:
            return "degrading"
        return "healthy"

    def _recover_panels(self):
        """Transient faults self-recover slowly; soiling only clears with rain or a crew."""
        raining = self.cloud > 85
        for p in self.panels:
            if p["health"] >= 100 or p["status"] == "faulted":
                continue
            if p["status"] == "soiled":
                if not raining:
                    continue
                p["health"] = round(min(100.0, p["health"] + 2.0), 1)
            else:
                p["health"] = round(min(100.0, p["health"] + 0.15), 1)
            p["status"] = self._status_for(p["health"], p["last_fault"])

    def service_panel(self, panel_id: str) -> dict:
        panel = next((p for p in self.panels if p["panel_id"] == panel_id), None)
        if panel is None:
            raise HTTPException(status_code=404, detail="Panel not found")
        panel.update(health=100.0, status="healthy", last_fault=None,
                     last_serviced=self.sim_clock.isoformat())
        emit("service", panel)
        return panel

    # ----------------------------------------------------------------- loop
    async def run_forever(self):
        """Infinite background loop: one tick every BASE_TICK_SECONDS / speed."""
        while True:
            if not self.paused:
                try:
                    self.tick()
                except Exception as exc:  # keep the twin alive on unexpected errors
                    print(f"[digital_twin] tick failed: {exc}")
            await asyncio.sleep(BASE_TICK_SECONDS / self.speed)

    def start(self):
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.run_forever())

    async def stop(self):
        if self.task:
            self.task.cancel()
            self.task = None

    def status(self) -> dict:
        perf = 100 * self.total_energy_kwh / self.total_expected_kwh if self.total_expected_kwh else 100.0
        healthy = sum(1 for p in self.panels if p["status"] == "healthy")
        return {
            "running": self.task is not None and not self.task.done(),
            "paused": self.paused,
            "speed": self.speed,
            "tick_interval_s": round(BASE_TICK_SECONDS / self.speed, 2),
            "anomaly_rate": self.anomaly_rate,
            "tick_count": self.tick_count,
            "sim_clock": self.sim_clock.isoformat(),
            "started_at": self.started_at.isoformat(),
            "total_energy_kwh": round(self.total_energy_kwh, 2),
            "total_expected_kwh": round(self.total_expected_kwh, 2),
            "performance_ratio_pct": round(perf, 2),
            "total_anomalies": self.total_anomalies,
            "revenue_usd": round(self.total_energy_kwh * TARIFF_USD_PER_KWH, 2),
            "lost_revenue_usd": round(max(0.0, self.total_expected_kwh - self.total_energy_kwh) * TARIFF_USD_PER_KWH, 2),
            "co2_avoided_kg": round(self.total_energy_kwh * CO2_KG_PER_KWH, 1),
            "fleet_health_pct": round(sum(p["health"] for p in self.panels) / PANEL_COUNT, 1),
            "healthy_panels": healthy,
            "panel_count": PANEL_COUNT,
            "capacity_kw": capacity_kw,
            "tariff_usd_per_kwh": TARIFF_USD_PER_KWH,
        }


twin = DigitalTwin()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    hour_of_day: int = Field(..., ge=0, le=23)
    ambient_temp_c: float = Field(..., ge=-40, le=60)
    module_temp_c: float = Field(..., ge=-40, le=100)
    solar_irradiance_w_m2: float = Field(..., ge=0, le=1400)
    cloud_cover_pct: float = Field(..., ge=0, le=100)


class ControlRequest(BaseModel):
    paused: Optional[bool] = None
    speed: Optional[float] = Field(None, ge=0.25, le=10)
    anomaly_rate: Optional[float] = Field(None, ge=0, le=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
router = APIRouter()


@router.get("/telemetry")
async def get_telemetry():
    """Rolling 24-hour window of live telemetry."""
    return live_telemetry


@router.get("/anomalies")
async def get_anomalies():
    """The 8 most recent severe anomalies."""
    return live_anomalies


@router.post("/predict")
async def predict(req: PredictRequest):
    """Run arbitrary conditions through the XGBoost model."""
    return {"expected_yield_kwh": round(predict_yield(req.model_dump()), 3)}


@router.post("/anomalies/{anomaly_id}/ack")
async def acknowledge_anomaly(anomaly_id: str):
    for a in live_anomalies:
        if a["id"] == anomaly_id:
            a["acknowledged"] = True
            emit("ack", a)
            return a
    raise HTTPException(status_code=404, detail="Anomaly not found")


@router.get("/simulator/status")
async def simulator_status():
    return twin.status()


@router.post("/simulator/control")
async def simulator_control(req: ControlRequest):
    if req.paused is not None:
        twin.paused = req.paused
    if req.speed is not None:
        twin.speed = req.speed
    if req.anomaly_rate is not None:
        twin.anomaly_rate = req.anomaly_rate
    return twin.status()


@router.post("/simulator/inject")
async def simulator_inject():
    """Force an anomaly on the next daylight tick."""
    twin.force_next = True
    return {"queued": True}


@router.post("/simulator/reset")
async def simulator_reset():
    twin.reset()
    return twin.status()


@router.get("/panels")
async def get_panels():
    return twin.panels


@router.post("/panels/{panel_id}/service")
async def service_panel(panel_id: str):
    """Dispatch a maintenance crew: cleans / repairs the panel to 100% health."""
    return twin.service_panel(panel_id)


@router.get("/forecast")
async def forecast():
    """24-hour ahead yield forecast using the model on projected weather."""
    rng = np.random.default_rng(7)
    cloud, out = twin.cloud, []
    for i in range(1, 25):
        t = twin.sim_clock + timedelta(hours=i)
        cloud = float(np.clip(cloud + rng.normal(0, 5), 0, 100))
        cond = physics.simulate_conditions(t.hour, twin.daily_mean, twin.daily_swing,
                                           cloud, twin.season, rng)
        clear = physics.simulate_conditions(t.hour, twin.daily_mean, twin.daily_swing,
                                            0.0, twin.season, rng)
        out.append({"timestamp": t.isoformat(), "hour_of_day": t.hour,
                    "forecast_yield_kwh": round(predict_yield(cond), 3),
                    "clear_sky_yield_kwh": round(predict_yield(clear), 3),
                    "cloud_cover_pct": round(cloud, 1)})
    return out


@router.get("/ml/metrics")
async def ml_metrics():
    with open(METRICS_PATH) as fh:
        return json.load(fh)


@router.get("/ml/clusters")
async def ml_clusters():
    with open(DBSCAN_PATH) as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Standalone application:  uvicorn api:app --app-dir solarsense/src --port 8000
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_: FastAPI):
    load_model()
    twin.start()
    yield
    await twin.stop()


app = FastAPI(title="SolarSense Digital Twin", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
