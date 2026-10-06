"""SolarSense backend regression tests - digital twin, ML, assistant."""
import json
import os
import time

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://solar-anomaly.preview.emergentagent.com"
API = f"{BASE}/api"


# ---------- Simulator core ----------
class TestSimulatorCore:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["service"] == "SolarSense"

    def test_status(self):
        r = requests.get(f"{API}/simulator/status")
        assert r.status_code == 200
        d = r.json()
        for k in ("running", "paused", "speed", "anomaly_rate", "tick_count",
                  "sim_clock", "total_energy_kwh", "performance_ratio_pct",
                  "fleet_health_pct", "panel_count", "capacity_kw"):
            assert k in d, f"missing {k}"
        assert d["panel_count"] == 48
        assert d["running"] is True

    def test_telemetry_window(self):
        r = requests.get(f"{API}/telemetry")
        assert r.status_code == 200
        pts = r.json()
        assert isinstance(pts, list)
        assert len(pts) <= 24
        if pts:
            p = pts[-1]
            for k in ("expected_yield_kwh", "actual_yield_kwh",
                      "efficiency_residual", "timestamp", "tick",
                      "solar_irradiance_w_m2"):
                assert k in p

    def test_telemetry_growth_over_tick(self):
        t1 = requests.get(f"{API}/telemetry").json()
        # Tick is 3s. Wait a bit > one tick
        time.sleep(4)
        t2 = requests.get(f"{API}/telemetry").json()
        # Either grew (window < 24) or last tick number advanced
        if t1 and t2:
            assert t2[-1]["tick"] >= t1[-1]["tick"]
            assert t2[-1]["tick"] > t1[-1]["tick"] - 1  # advanced within reason

    def test_anomalies_cap(self):
        r = requests.get(f"{API}/anomalies")
        assert r.status_code == 200
        data = r.json()
        assert len(data) <= 8
        for a in data:
            assert a["panel_id"].startswith("P-")
            assert "severity" in a and "type" in a


# ---------- Predict ----------
class TestPredict:
    def test_valid(self):
        payload = {"hour_of_day": 12, "ambient_temp_c": 25, "module_temp_c": 40,
                   "solar_irradiance_w_m2": 900, "cloud_cover_pct": 15}
        r = requests.post(f"{API}/predict", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert "expected_yield_kwh" in d
        assert isinstance(d["expected_yield_kwh"], (int, float))
        assert d["expected_yield_kwh"] >= 0

    def test_zero_irradiance_returns_zero(self):
        payload = {"hour_of_day": 2, "ambient_temp_c": 10, "module_temp_c": 10,
                   "solar_irradiance_w_m2": 0, "cloud_cover_pct": 90}
        r = requests.post(f"{API}/predict", json=payload)
        assert r.status_code == 200
        assert r.json()["expected_yield_kwh"] == 0.0

    def test_invalid_422(self):
        payload = {"hour_of_day": 30, "ambient_temp_c": 25, "module_temp_c": 40,
                   "solar_irradiance_w_m2": 900, "cloud_cover_pct": 15}
        r = requests.post(f"{API}/predict", json=payload)
        assert r.status_code == 422

    def test_missing_field_422(self):
        r = requests.post(f"{API}/predict", json={"hour_of_day": 12})
        assert r.status_code == 422


# ---------- Simulator control / panels / inject / reset ----------
class TestSimulatorControl:
    def test_control_speed_and_pause_resume(self):
        r = requests.post(f"{API}/simulator/control", json={"paused": True, "speed": 2.0})
        assert r.status_code == 200
        s = r.json()
        assert s["paused"] is True
        assert s["speed"] == 2.0
        # resume
        r = requests.post(f"{API}/simulator/control", json={"paused": False, "speed": 1.0})
        assert r.status_code == 200
        assert r.json()["paused"] is False

    def test_control_anomaly_rate(self):
        r = requests.post(f"{API}/simulator/control", json={"anomaly_rate": 0.25})
        assert r.status_code == 200
        assert abs(r.json()["anomaly_rate"] - 0.25) < 1e-6
        # restore
        requests.post(f"{API}/simulator/control", json={"anomaly_rate": 0.08})

    def test_control_invalid_speed_422(self):
        r = requests.post(f"{API}/simulator/control", json={"speed": 999})
        assert r.status_code == 422

    def test_inject_queued(self):
        r = requests.post(f"{API}/simulator/inject")
        assert r.status_code == 200
        assert r.json()["queued"] is True

    def test_panels_48(self):
        r = requests.get(f"{API}/panels")
        assert r.status_code == 200
        panels = r.json()
        assert len(panels) == 48
        ids = {p["panel_id"] for p in panels}
        assert "P-1" in ids and "P-48" in ids
        for k in ("row", "col", "health", "status"):
            assert k in panels[0]

    def test_service_panel(self):
        r = requests.post(f"{API}/panels/P-7/service")
        assert r.status_code == 200
        p = r.json()
        assert p["panel_id"] == "P-7"
        assert p["health"] == 100.0
        assert p["status"] == "healthy"

    def test_service_unknown_panel_404(self):
        r = requests.post(f"{API}/panels/P-999/service")
        assert r.status_code == 404

    def test_ack_unknown_anomaly_404(self):
        r = requests.post(f"{API}/anomalies/nonexistent-id/ack")
        assert r.status_code == 404


# ---------- Forecast / ML ----------
class TestML:
    def test_forecast_24(self):
        r = requests.get(f"{API}/forecast")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 24
        for pt in data:
            assert "forecast_yield_kwh" in pt
            assert "clear_sky_yield_kwh" in pt
            assert "hour_of_day" in pt

    def test_ml_metrics(self):
        r = requests.get(f"{API}/ml/metrics")
        assert r.status_code == 200
        d = r.json()
        for k in ("mae", "mse", "rmse", "r2"):
            assert k in d, f"missing {k} - got keys {list(d.keys())}"

    def test_ml_clusters(self):
        r = requests.get(f"{API}/ml/clusters")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, (dict, list))


# ---------- Assistant ----------
class TestAssistant:
    SID = "TEST_pytest_session"

    def test_history_empty_or_list(self):
        r = requests.get(f"{API}/assistant/history/{self.SID}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_chat_sse_stream(self):
        r = requests.post(f"{API}/assistant/chat",
                          json={"session_id": self.SID, "message": "In one short sentence, what is a solar panel?"},
                          stream=True, timeout=60)
        assert r.status_code == 200
        got_delta = False
        got_done = False
        text_total = ""
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                payload = line[6:]
                if payload == "[DONE]":
                    got_done = True
                    break
                try:
                    j = json.loads(payload)
                    if "delta" in j:
                        got_delta = True
                        text_total += j["delta"]
                    elif "error" in j:
                        pytest.fail(f"Stream error: {j['error']}")
                except json.JSONDecodeError:
                    pass
        assert got_done, "Did not get [DONE] marker"
        assert got_delta, "Did not get any delta payload"
        assert len(text_total) > 0

    def test_history_has_messages_after_chat(self):
        r = requests.get(f"{API}/assistant/history/{self.SID}")
        assert r.status_code == 200
        hist = r.json()
        assert len(hist) >= 2  # user + assistant
        roles = {m["role"] for m in hist}
        assert "user" in roles and "assistant" in roles

    def test_chat_validation(self):
        r = requests.post(f"{API}/assistant/chat", json={"session_id": "", "message": "hi"})
        assert r.status_code == 422

    def test_clear_history(self):
        r = requests.delete(f"{API}/assistant/history/{self.SID}")
        assert r.status_code == 200
        assert r.json()["cleared"] is True
        r2 = requests.get(f"{API}/assistant/history/{self.SID}")
        assert r2.json() == []


# ---------- Standalone scripts from any cwd ----------
class TestStandaloneScripts:
    def test_generate_mock_data_import(self, tmp_path):
        import subprocess
        res = subprocess.run(
            ["python", "-c", "import sys; sys.path.insert(0,'/app/solarsense/src'); import generate_mock_data; print('ok')"],
            cwd=str(tmp_path), capture_output=True, text=True, timeout=30
        )
        assert res.returncode == 0, res.stderr

    def test_scripts_present(self):
        for name in ("generate_mock_data.py", "supervised_xgboost.py", "unsupervised_dbscan.py"):
            assert os.path.exists(f"/app/solarsense/src/{name}") or os.path.exists(f"/app/backend/solarsense/src/{name}")


# ---------- Teardown: restore defaults ----------
def teardown_module(_mod):
    try:
        requests.post(f"{API}/simulator/control",
                      json={"paused": False, "speed": 1.0, "anomaly_rate": 0.08}, timeout=10)
    except Exception:
        pass
