import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTwin } from "@/context/TwinContext";
import { ChartTip } from "@/components/common";
import { fmtHour } from "@/lib/api";

export function ResidualChart({ height = 220 }) {
  const { telemetry, colors } = useTwin();
  const data = telemetry.map((t) => ({ ...t, label: fmtHour(t.timestamp) }));
  return (
    <div style={{ height }} data-testid="residual-chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "transparent" }} />
          <ReferenceLine y={0} stroke={colors.muted} />
          <Bar dataKey="efficiency_residual" name="Residual" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={d.is_anomaly ? colors.alert : d.efficiency_residual >= 0 ? colors.energy : colors.solar} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
