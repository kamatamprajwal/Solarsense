import { useEffect, useState } from "react";
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useTwin } from "@/context/TwinContext";
import { ChartTip } from "@/components/common";
import { api, fmtHour } from "@/lib/api";

export function ForecastChart({ height = 240 }) {
  const { colors, status } = useTwin();
  const [data, setData] = useState([]);
  const hour = status?.sim_clock?.slice(0, 13);

  useEffect(() => {
    api.forecast().then((d) => setData(d.map((x) => ({ ...x, label: fmtHour(x.timestamp) })))).catch(() => {});
  }, [hour]);

  const total = data.reduce((s, d) => s + d.forecast_yield_kwh, 0);
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-mono text-2xl font-bold" data-testid="forecast-total">{total.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">kWh forecast next 24h</span>
      </div>
      <div style={{ height }} data-testid="forecast-chart">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gFc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.energy} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors.energy} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={3} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Line type="monotone" dataKey="clear_sky_yield_kwh" name="Clear-sky potential" stroke={colors.muted} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="forecast_yield_kwh" name="Forecast" stroke={colors.energy} strokeWidth={2} fill="url(#gFc)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
