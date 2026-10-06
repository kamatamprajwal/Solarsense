"""Tests for new SolarSense features: history, alerts, cleaning planner."""
import os
import time
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://solar-anomaly.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
RECIPIENT = "delivered@resend.dev"


# ---------- Anomaly History ----------
class TestHistory:
    def test_list_default(self):
        r = requests.get(f"{API}/history/anomalies")
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "items" in d
        assert isinstance(d["items"], list)

    def test_list_filters(self):
        r = requests.get(f"{API}/history/anomalies", params={"status": "open", "limit": 5})
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) <= 5
        for it in d["items"]:
            assert it["resolved"] is False
            assert it["acknowledged"] is False

    def test_stats(self):
        r = requests.get(f"{API}/history/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "open", "resolved", "critical", "lost_revenue_usd",
                  "by_type", "top_panels", "by_day"):
            assert k in d
        assert isinstance(d["by_type"], list)
        assert isinstance(d["by_day"], list)

    def test_speed_up_and_generate(self):
        # Speed up to generate anomalies
        r = requests.post(f"{API}/simulator/control", json={"speed": 10, "anomaly_rate": 0.5})
        assert r.status_code == 200
        # Inject a few
        for _ in range(5):
            requests.post(f"{API}/simulator/inject")
        time.sleep(15)
        # Check history grew
        r = requests.get(f"{API}/history/anomalies", params={"limit": 50})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1, "Expected at least one anomaly in history"

    def test_ack_history_record(self):
        r = requests.get(f"{API}/history/anomalies", params={"status": "open", "limit": 1})
        items = r.json()["items"]
        if not items:
            pytest.skip("No open anomalies to ack")
        aid = items[0]["id"]
        r = requests.post(f"{API}/anomalies/{aid}/ack")
        assert r.status_code == 200
        time.sleep(2)
        # Verify persistence
        r2 = requests.get(f"{API}/history/anomalies", params={"panel_id": items[0]["panel_id"], "limit": 50})
        found = [x for x in r2.json()["items"] if x["id"] == aid]
        assert found and found[0]["acknowledged"] is True

    def test_service_resolves_open(self):
        r = requests.get(f"{API}/history/anomalies", params={"status": "open", "limit": 1})
        items = r.json()["items"]
        if not items:
            pytest.skip("No open anomalies")
        panel_id = items[0]["panel_id"]
        r = requests.post(f"{API}/panels/{panel_id}/service")
        assert r.status_code == 200
        time.sleep(2)
        r2 = requests.get(f"{API}/history/anomalies", params={"panel_id": panel_id, "status": "open"})
        assert r2.json()["total"] == 0


# ---------- Alerts ----------
class TestAlerts:
    def test_get_settings_default(self):
        r = requests.get(f"{API}/alerts/settings")
        assert r.status_code == 200
        d = r.json()
        assert "recipients" in d
        assert "min_severity" in d
        assert "cooldown_minutes" in d

    def test_put_settings_valid(self):
        body = {"enabled": True, "recipients": [RECIPIENT], "min_severity": "critical", "cooldown_minutes": 10}
        r = requests.put(f"{API}/alerts/settings", json=body)
        assert r.status_code == 200
        assert r.json()["recipients"] == [RECIPIENT]

    def test_put_settings_invalid_email_422(self):
        r = requests.put(f"{API}/alerts/settings", json={
            "recipients": ["not-an-email"], "min_severity": "critical", "cooldown_minutes": 10})
        assert r.status_code == 422

    def test_put_settings_too_many_recipients_422(self):
        r = requests.put(f"{API}/alerts/settings", json={
            "recipients": [f"a{i}@x.com" for i in range(6)], "min_severity": "critical", "cooldown_minutes": 10})
        assert r.status_code == 422

    def test_put_settings_bad_cooldown_422(self):
        r = requests.put(f"{API}/alerts/settings", json={
            "recipients": [RECIPIENT], "min_severity": "critical", "cooldown_minutes": 0})
        assert r.status_code == 422

    def test_put_settings_bad_severity_422(self):
        r = requests.put(f"{API}/alerts/settings", json={
            "recipients": [RECIPIENT], "min_severity": "low", "cooldown_minutes": 10})
        assert r.status_code == 422

    def test_test_alert_no_recipients_400(self):
        requests.put(f"{API}/alerts/settings", json={
            "enabled": True, "recipients": [], "min_severity": "critical", "cooldown_minutes": 10})
        r = requests.post(f"{API}/alerts/test")
        assert r.status_code == 400

    def test_test_alert_send_then_429(self):
        # Set recipient
        requests.put(f"{API}/alerts/settings", json={
            "enabled": True, "recipients": [RECIPIENT], "min_severity": "critical", "cooldown_minutes": 10})
        r = requests.post(f"{API}/alerts/test")
        # Either 200 (sent) or if last_test was recent 429
        assert r.status_code in (200, 429)
        if r.status_code == 200:
            # Immediate second call should be 429
            r2 = requests.post(f"{API}/alerts/test")
            assert r2.status_code == 429

    def test_alert_log(self):
        r = requests.get(f"{API}/alerts/log")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_alert_status(self):
        r = requests.get(f"{API}/alerts/status")
        assert r.status_code == 200
        d = r.json()
        assert "pending" in d and "last_sent" in d


# ---------- Digest ----------
class TestDigest:
    def test_digest_delivery(self):
        # Set recipient and speed up for critical anomalies
        requests.put(f"{API}/alerts/settings", json={
            "enabled": True, "recipients": [RECIPIENT], "min_severity": "critical", "cooldown_minutes": 1})
        requests.post(f"{API}/simulator/control", json={"speed": 10, "anomaly_rate": 0.6})
        for _ in range(8):
            requests.post(f"{API}/simulator/inject")
        # Wait for flush cycle (20s) plus some margin
        time.sleep(35)
        r = requests.get(f"{API}/alerts/log")
        log = r.json()
        digests = [x for x in log if x.get("kind") == "digest"]
        if not digests:
            pytest.skip("No digest emails produced in window (may need more critical anomalies)")
        assert digests[0]["status"] in ("sent", "failed")


# ---------- Cleaning Planner ----------
class TestPlanner:
    def test_plan_default(self):
        r = requests.get(f"{API}/maintenance/cleaning-plan")
        assert r.status_code == 200
        d = r.json()
        assert d["horizon_days"] == 7
        assert len(d["days"]) == 7
        for day in d["days"]:
            for k in ("date", "forecast_kwh", "avg_cloud_pct", "rain_likely",
                      "workable", "net_benefit_usd", "recommended"):
                assert k in day
            if day["rain_likely"]:
                assert day["recommended"] is False, "Rainy day should never be recommended"
        assert "candidates" in d
        assert "recommendation" in d
        assert "message" in d["recommendation"]

    def test_plan_14(self):
        r = requests.get(f"{API}/maintenance/cleaning-plan", params={"days": 14})
        assert r.status_code == 200
        assert len(r.json()["days"]) == 14

    def test_plan_params(self):
        r = requests.get(f"{API}/maintenance/cleaning-plan",
                         params={"days": 7, "tariff": 0.20, "cost_per_panel": 0.5})
        assert r.status_code == 200
        d = r.json()
        assert d["tariff"] == 0.20
        assert d["cost_per_panel"] == 0.5

    def test_plan_invalid_days_422(self):
        r = requests.get(f"{API}/maintenance/cleaning-plan", params={"days": 2})
        assert r.status_code == 422

    def test_jobs_crud(self):
        # Create job with unknown panel -> 400
        r = requests.post(f"{API}/maintenance/jobs", json={
            "date": "2026-01-15", "panel_ids": ["P-9999"]})
        assert r.status_code == 400

        # Create job with real panel
        r = requests.post(f"{API}/maintenance/jobs", json={
            "date": "2026-01-15", "panel_ids": ["P-3"]})
        assert r.status_code == 200
        job = r.json()
        jid = job["id"]
        assert job["status"] == "scheduled"

        # List
        r = requests.get(f"{API}/maintenance/jobs")
        assert r.status_code == 200
        assert any(j["id"] == jid for j in r.json())

        # Complete
        r = requests.post(f"{API}/maintenance/jobs/{jid}/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

        # Verify P-3 serviced -> health 100
        p = requests.get(f"{API}/panels").json()
        p3 = [x for x in p if x["panel_id"] == "P-3"][0]
        assert p3["health"] == 100.0

    def test_complete_unknown_job_404(self):
        r = requests.post(f"{API}/maintenance/jobs/nonexistent/complete")
        assert r.status_code == 404


# ---------- Teardown ----------
def teardown_module(_mod):
    try:
        requests.post(f"{API}/simulator/control",
                      json={"paused": False, "speed": 1.0, "anomaly_rate": 0.08}, timeout=10)
        requests.put(f"{API}/alerts/settings", json={
            "enabled": True, "recipients": [], "min_severity": "critical", "cooldown_minutes": 10}, timeout=10)
    except Exception:
        pass
