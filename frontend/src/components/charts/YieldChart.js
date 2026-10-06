import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useTwin } from "@/context/TwinContext";
import { ChartTip } from "@/components/common";
import { fmtHour } from "@/lib/api";

export function YieldChart({ height = 300 }) {
  const { telemetry, colors } = useTwin();
  const data = telemetry.map((t) => ({ ...t, label: fmtHour(t.timestamp) }));
  return (
    <div style={{ height }} data-testid="yield-chart">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.cyan} stopOpacity={0.25} />
              <stop offset="100%" stopColor={colors.cyan} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.solar} stopOpacity={0.45} />
              <stop offset="100%" stopColor={colors.solar} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Area type="monotone" dataKey="expected_yield_kwh" name="Expected (XGBoost)" stroke={colors.cyan} strokeDasharray="5 4" strokeWidth={2} fill="url(#gExp)" isAnimationActive={false} />
          <Area type="monotone" dataKey="actual_yield_kwh" name="Actual" stroke={colors.solar} strokeWidth={2.5} fill="url(#gAct)" isAnimationActive={false} />
          {data.filter((d) => d.is_anomaly).map((d) => (
            <ReferenceDot key={d.id} x={d.label} y={d.actual_yield_kwh} r={6} fill={colors.alert} stroke={colors.card} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
