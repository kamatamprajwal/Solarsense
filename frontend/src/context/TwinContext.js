import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const TwinContext = createContext(null);

const PALETTES = {
  dark: { solar: "#F59E0B", energy: "#10B981", alert: "#EF4444", cyan: "#06B6D4", violet: "#8B5CF6", muted: "#64748B", grid: "#1E293B", card: "#0F172A" },
  light: { solar: "#D97706", energy: "#059669", alert: "#DC2626", cyan: "#0891B2", violet: "#7C3AED", muted: "#64748B", grid: "#E2E8F0", card: "#FFFFFF" },
};

export function TwinProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("ss-theme") || "dark");
  const [telemetry, setTelemetry] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [status, setStatus] = useState(null);
  const [panels, setPanels] = useState([]);
  const [online, setOnline] = useState(true);
  const seen = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("ss-theme", theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    try {
      const [t, a, s, p] = await Promise.all([api.telemetry(), api.anomalies(), api.status(), api.panels()]);
      setTelemetry(t); setAnomalies(a); setStatus(s); setPanels(p); setOnline(true);
      if (seen.current === null) seen.current = s.total_anomalies;
      else if (s.total_anomalies > seen.current) {
        const latest = a[a.length - 1];
        if (latest) toast.error(`${latest.type} on ${latest.panel_id}`, { description: `Yield dropped ${latest.drop_pct}% at ${latest.timestamp.slice(11, 16)} sim-time` });
        seen.current = s.total_anomalies;
      } else seen.current = s.total_anomalies;
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const value = {
    theme, setTheme, colors: PALETTES[theme], telemetry, anomalies, status, panels, online, refresh,
    latest: telemetry[telemetry.length - 1],
  };
  return <TwinContext.Provider value={value}>{children}</TwinContext.Provider>;
}

export const useTwin = () => useContext(TwinContext);
