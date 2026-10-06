# SolarSense PRD

## Original problem
Build SolarSense predictive solar array monitoring: mock data generator, XGBoost yield regressor, DBSCAN hardware-anomaly detector, FastAPI digital twin (3s ticks, +1h sim clock, 8% anomalies, 24-pt telemetry, 8 anomalies, /telemetry /anomalies /predict) + best-possible frontend with many extra features. Later: user uploaded solar_telemetry.csv to use for training/testing.

## Choices
Standalone /app/solarsense (symlink to /app/backend/solarsense) + mounted in /app/backend under /api; AI copilot = Gemini 3 Flash via Emergent LLM key; light+dark theme toggle; no auth.

## Architecture
- backend/solarsense/src: generate_mock_data.py (won't overwrite existing CSV unless --force), supervised_xgboost.py (metrics + capacity estimate -> models/model_metrics.json), unsupervised_dbscan.py (-> data/dbscan_results.json), api.py (DigitalTwin + router + standalone app)
- backend/server.py composition root; backend/assistant.py SSE copilot w/ Mongo chat history
- Frontend pages: Overview, Panel Array, Predictor, ML Lab, AI Copilot, Architecture

## Implemented (2026-06)
- All 4 tasks; trained on user CSV (8,760 rows, 2023): MAE 0.030, MSE 0.0097, R² 0.99; DBSCAN 417 anomalies / 3,953 normal
- Extras: simulator controls (pause/speed/anomaly rate/inject/reset), 48-panel twin with service, ack alerts, 24h forecast, what-if predictor + sensitivity + revenue, CSV exports, AI copilot w/ quick prompts + export
- Tested: 27/27 backend, frontend 100% (iteration_1)

## Iteration 2 (2026-06)
- Anomaly History Log: every twin fault persisted in Mongo (anomaly_history) via event hooks; ack/service update status; filters, stats, CSV export (/incidents)
- Fault Alert Emails: Resend (Emergent-managed), recipients/severity/cooldown in app settings, digest per cooldown, test send, email log
- Cleaning Planner: multi-day XGBoost forecast + soiling loss -> best workable day (rain skipped), crew jobs schedule/complete (/cleaning)
- Soiled panels no longer self-recover except in rain
- Tested: iteration_2 backend 23/23, frontend 100%

## Backlog
- P1: upload new CSV from UI and retrain; persist anomaly history in Mongo
- P2: email/Slack alerts; multi-site support
