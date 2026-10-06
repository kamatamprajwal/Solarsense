"""
SolarSense - Task 3: Unsupervised hardware-anomaly detection (DBSCAN).

Idea: during daylight, a healthy array's (irradiance, module temp, residual)
triplets form dense clusters. Soiling, shading or inverter failures produce
large negative residuals that fall in sparse regions -> DBSCAN noise (-1).

Pipeline:
  1. Load data/telemetry_with_predictions.csv
  2. Keep daylight rows (irradiance > 10 W/m2)
  3. Standardize ['solar_irradiance_w_m2', 'module_temp_c', 'efficiency_residual']
  4. PCA -> 2 components (denoise + enables 2D visualisation)
  5. DBSCAN; label -1 = anomaly
  6. Print counts; save data/dbscan_results.json for the dashboard

Run:  python src/unsupervised_dbscan.py
"""

import json
import os

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "data")
INPUT_CSV = os.path.join(DATA_DIR, "telemetry_with_predictions.csv")
RESULTS_PATH = os.path.join(DATA_DIR, "dbscan_results.json")

CLUSTER_FEATURES = ["solar_irradiance_w_m2", "module_temp_c", "efficiency_residual"]
DBSCAN_EPS = 0.25
DBSCAN_MIN_SAMPLES = 12


def run() -> dict:
    # 1-2. Load & daylight filter ----------------------------------------------
    df = pd.read_csv(INPUT_CSV)
    day = df[df["solar_irradiance_w_m2"] > 10].copy().reset_index(drop=True)

    # 3. Standardize -------------------------------------------------------------
    # Residual is weighted x2 so that yield deficits dominate the density signal.
    scaled = StandardScaler().fit_transform(day[CLUSTER_FEATURES])
    scaled[:, 2] *= 2.0

    # 4. PCA -----------------------------------------------------------------------
    pca = PCA(n_components=2, random_state=42)
    components = pca.fit_transform(scaled)
    day["pc1"], day["pc2"] = components[:, 0], components[:, 1]

    # 5. DBSCAN --------------------------------------------------------------------
    labels = DBSCAN(eps=DBSCAN_EPS, min_samples=DBSCAN_MIN_SAMPLES).fit_predict(components)
    day["cluster"] = labels

    n_anomalies = int((labels == -1).sum())
    n_normal = int((labels != -1).sum())
    n_clusters = int(len(set(labels)) - (1 if -1 in labels else 0))

    # 6. Report ---------------------------------------------------------------------
    print(f"[unsupervised_dbscan] Daylight samples analysed : {len(day):,}")
    print(f"[unsupervised_dbscan] Clusters found            : {n_clusters}")
    print(f"[unsupervised_dbscan] Normal operations         : {n_normal:,}")
    print(f"[unsupervised_dbscan] Detected anomalies (-1)   : {n_anomalies:,}")

    anomalies = day[day["cluster"] == -1]
    normal_sample = day[day["cluster"] != -1].sample(n=min(1200, n_normal), random_state=7)
    plot = pd.concat([normal_sample, anomalies])
    results = {
        "n_samples": int(len(day)),
        "n_normal": n_normal,
        "n_anomalies": n_anomalies,
        "n_clusters": n_clusters,
        "anomaly_rate_pct": round(100 * n_anomalies / max(1, len(day)), 2),
        "eps": DBSCAN_EPS,
        "min_samples": DBSCAN_MIN_SAMPLES,
        "explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
        "mean_residual_anomaly": round(float(anomalies["efficiency_residual"].mean()), 3) if n_anomalies else 0,
        "mean_residual_normal": round(float(day[day["cluster"] != -1]["efficiency_residual"].mean()), 3),
        "residual_histogram": _histogram(day["efficiency_residual"].values),
        "points": [
            {"pc1": round(float(r.pc1), 3), "pc2": round(float(r.pc2), 3),
             "cluster": int(r.cluster), "irradiance": float(r.solar_irradiance_w_m2),
             "module_temp": float(r.module_temp_c), "residual": float(r.efficiency_residual),
             "timestamp": r.timestamp}
            for r in plot.itertuples()],
    }
    with open(RESULTS_PATH, "w") as fh:
        json.dump(results, fh)
    return results


def _histogram(values: np.ndarray, bins: int = 30) -> list:
    counts, edges = np.histogram(values, bins=bins)
    return [{"bin": round(float((edges[i] + edges[i + 1]) / 2), 2), "count": int(c)}
            for i, c in enumerate(counts)]


if __name__ == "__main__":
    run()
