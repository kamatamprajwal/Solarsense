"""
SolarSense - Task 2: Supervised yield model (XGBoost Regressor).

Pipeline:
  1. Load data/solar_telemetry.csv
  2. Split features/target and train/test
  3. Train xgboost.XGBRegressor
  4. Print MAE / MSE (plus RMSE / R2)
  5. Add efficiency_residual = actual - predicted, save data/telemetry_with_predictions.csv
  6. Persist model -> models/xgboost_yield_model.pkl
     and evaluation metadata -> models/model_metrics.json (consumed by the dashboard)

Run:  python src/supervised_xgboost.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

# ---------------------------------------------------------------------------
# Absolute paths
# ---------------------------------------------------------------------------
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "data")
MODELS_DIR = os.path.join(PROJECT_DIR, "models")
INPUT_CSV = os.path.join(DATA_DIR, "solar_telemetry.csv")
OUTPUT_CSV = os.path.join(DATA_DIR, "telemetry_with_predictions.csv")
MODEL_PATH = os.path.join(MODELS_DIR, "xgboost_yield_model.pkl")
METRICS_PATH = os.path.join(MODELS_DIR, "model_metrics.json")

FEATURES = ["hour_of_day", "ambient_temp_c", "module_temp_c",
            "solar_irradiance_w_m2", "cloud_cover_pct"]
TARGET = "energy_yield_kwh"


def train() -> dict:
    # 1. Load ---------------------------------------------------------------
    df = pd.read_csv(INPUT_CSV)
    X, y = df[FEATURES], df[TARGET]

    # 2. Split (80/20) ------------------------------------------------------
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42)

    # 3. Train --------------------------------------------------------------
    model = XGBRegressor(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # 4. Evaluate -----------------------------------------------------------
    y_pred = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, y_pred))
    mse = float(mean_squared_error(y_test, y_pred))
    r2 = float(r2_score(y_test, y_pred))
    print(f"[supervised_xgboost] MAE = {mae:.4f} kWh")
    print(f"[supervised_xgboost] MSE = {mse:.4f} kWh^2")
    print(f"[supervised_xgboost] R2  = {r2:.4f}")

    # 5. Residuals over the full dataset ---------------------------------------
    df["predicted_yield_kwh"] = np.clip(model.predict(X), 0, None).round(3)
    df["efficiency_residual"] = (df[TARGET] - df["predicted_yield_kwh"]).round(3)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"[supervised_xgboost] Saved predictions -> {OUTPUT_CSV}")

    # 6. Persist model + metadata ------------------------------------------------
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"[supervised_xgboost] Saved model -> {MODEL_PATH}")

    sample = pd.DataFrame({"actual": y_test.values, "predicted": y_pred}).sample(
        n=min(300, len(y_test)), random_state=1)
    metrics = {
        "mae": round(mae, 4),
        "mse": round(mse, 4),
        "rmse": round(float(np.sqrt(mse)), 4),
        "r2": round(r2, 4),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "features": FEATURES,
        "feature_importance": {f: round(float(v), 4)
                               for f, v in zip(FEATURES, model.feature_importances_)},
        "hyperparameters": {"n_estimators": 400, "max_depth": 6, "learning_rate": 0.05},
        "pred_vs_actual_sample": [
            {"actual": round(float(a), 3), "predicted": round(float(p), 3)}
            for a, p in zip(sample["actual"], sample["predicted"])],
    }
    with open(METRICS_PATH, "w") as fh:
        json.dump(metrics, fh, indent=2)
    return metrics


if __name__ == "__main__":
    train()
