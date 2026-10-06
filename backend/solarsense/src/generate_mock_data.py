"""
SolarSense - Task 1: Synthetic historical telemetry generator.

Produces 10,000 hourly rows of physically-plausible solar telemetry and writes
them to data/solar_telemetry.csv.

Physics model (simplified but realistic):
  * Irradiance follows a half-sine curve between sunrise (06:00) and sunset
    (18:00), peaking at solar noon (~1000 W/m2 on a clear summer day).
  * Clouds attenuate irradiance non-linearly (Kasten-Czeplak style).
  * Ambient temperature follows a cosine diurnal cycle peaking at 14:00.
  * Module temperature = ambient + irradiance-driven heating (NOCT model).
  * Energy yield (kWh per hour) scales with irradiance and is de-rated by the
    temperature coefficient of crystalline silicon (-0.4 %/degC above 25 degC)
    and by diffuse-light losses under cloud.

Run:  python src/generate_mock_data.py   (from any working directory)
"""

import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Absolute path resolution so the script works from any working directory.
# ---------------------------------------------------------------------------
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "data")
OUTPUT_CSV = os.path.join(DATA_DIR, "solar_telemetry.csv")

# ---------------------------------------------------------------------------
# Plant constants (shared with the live simulator in api.py).
# ---------------------------------------------------------------------------
ARRAY_CAPACITY_KW = 50.0          # Nameplate DC capacity of the array
SYSTEM_EFFICIENCY = 0.92          # Inverter + wiring + mismatch losses
TEMP_COEFFICIENT = -0.004         # Power loss per degC above STC (25 degC)
SUNRISE_HOUR, SUNSET_HOUR = 6, 18
PEAK_IRRADIANCE = 1000.0          # W/m2 at solar noon, clear sky

N_ROWS = 10_000


def clear_sky_irradiance(hour: float, season_factor: float = 1.0) -> float:
    """Half-sine clear-sky irradiance curve; exactly 0 outside daylight."""
    if hour <= SUNRISE_HOUR or hour >= SUNSET_HOUR:
        return 0.0
    phase = np.pi * (hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)
    return PEAK_IRRADIANCE * season_factor * np.sin(phase)


def ambient_temperature(hour: float, daily_mean: float, daily_swing: float) -> float:
    """Cosine diurnal cycle peaking at 14:00 and bottoming out around 02:00."""
    return daily_mean + daily_swing * np.cos(2 * np.pi * (hour - 14) / 24)


def simulate_conditions(hour: int, daily_mean: float, daily_swing: float,
                        cloud_cover: float, season_factor: float,
                        rng: np.random.Generator) -> dict:
    """
    Produce one hour of weather + module conditions.
    Reused by the live digital twin so historical and live data share physics.
    """
    ambient = ambient_temperature(hour, daily_mean, daily_swing) + rng.normal(0, 0.6)

    # Cloud attenuation: heavy clouds can remove up to ~80% of the irradiance.
    clear = clear_sky_irradiance(hour, season_factor)
    attenuation = 1.0 - 0.8 * (cloud_cover / 100.0) ** 1.6
    irradiance = max(0.0, clear * attenuation + (rng.normal(0, 12) if clear > 0 else 0.0))

    # NOCT-style module heating: ~ +28 degC at 1000 W/m2 on top of ambient.
    module_temp = ambient + (irradiance / 1000.0) * 28.0 + rng.normal(0, 0.8)

    return {
        "hour_of_day": int(hour),
        "ambient_temp_c": round(float(ambient), 2),
        "module_temp_c": round(float(module_temp), 2),
        "solar_irradiance_w_m2": round(float(irradiance), 2),
        "cloud_cover_pct": round(float(cloud_cover), 2),
    }


def physical_yield(irradiance: float, module_temp: float, cloud_cover: float) -> float:
    """Ground-truth physical energy yield (kWh produced in one hour)."""
    if irradiance <= 0:
        return 0.0
    temp_derate = 1.0 + TEMP_COEFFICIENT * (module_temp - 25.0)   # extreme heat hurts
    diffuse_loss = 1.0 - 0.06 * (cloud_cover / 100.0)             # spectral/diffuse loss
    return max(0.0, ARRAY_CAPACITY_KW * (irradiance / 1000.0) * SYSTEM_EFFICIENCY
               * temp_derate * diffuse_loss)


def next_cloud_cover(previous: float, rng: np.random.Generator) -> float:
    """Clouds evolve as a bounded random walk so weather is temporally coherent."""
    return float(np.clip(previous + rng.normal(0, 9), 0, 100))


def generate(n_rows: int = N_ROWS, seed: int = 42) -> pd.DataFrame:
    """Build the full synthetic historical dataframe."""
    rng = np.random.default_rng(seed)
    start = datetime(2025, 1, 1, 0, 0, 0)
    rows = []
    cloud = 30.0
    daily_mean = daily_swing = season = None

    for i in range(n_rows):
        ts = start + timedelta(hours=i)
        hour = ts.hour

        # New day -> re-sample daily climate driven by the season (day of year).
        if hour == 0 or daily_mean is None:
            doy = ts.timetuple().tm_yday
            seasonal = np.sin(2 * np.pi * (doy - 80) / 365)        # +1 summer, -1 winter
            daily_mean = 20 + 8 * seasonal + rng.normal(0, 2)
            daily_swing = 6 + rng.uniform(0, 3)
            season = 0.85 + 0.15 * seasonal

        cloud = next_cloud_cover(cloud, rng)
        cond = simulate_conditions(hour, daily_mean, daily_swing, cloud, season, rng)
        yield_kwh = physical_yield(cond["solar_irradiance_w_m2"], cond["module_temp_c"], cloud)

        # Sensor / measurement noise (+-2%).
        yield_kwh *= rng.uniform(0.98, 1.02)

        # Inject rare historical hardware faults (~3% of daylight hours) so the
        # unsupervised DBSCAN pipeline has real degradation events to discover.
        if yield_kwh > 1 and rng.random() < 0.03:
            yield_kwh *= rng.uniform(0.35, 0.65)

        rows.append({"timestamp": ts.isoformat(), **cond,
                     "energy_yield_kwh": round(float(yield_kwh), 3)})

    return pd.DataFrame(rows)


def main(force: bool = False) -> str:
    """Write the synthetic CSV. Never overwrites an existing (e.g. user-supplied) file unless --force."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(OUTPUT_CSV) and not force:
        print(f"[generate_mock_data] {OUTPUT_CSV} already exists - skipping (use --force to regenerate)")
        return OUTPUT_CSV
    df = generate()
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"[generate_mock_data] Wrote {len(df):,} rows -> {OUTPUT_CSV}")
    return OUTPUT_CSV


if __name__ == "__main__":
    import sys
    main(force="--force" in sys.argv)
