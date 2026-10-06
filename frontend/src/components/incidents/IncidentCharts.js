import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTwin } from "@/context/TwinContext";
import { Panel } from "@/components/common";

export function IncidentCharts({ stats }) {
  const { colors } = useTwin();
  const palette = [colors.alert, colors.solar, colors.violet, colors.cyan, colors.energy];
  const tip = { background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 };
  return (
    <>
      <Panel title="Faults by type" testid="chart-by-type">
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={stats.by_type} layout="vertical" margin={{ left: 20, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="key" tickLine={false} axisLine={false} width={100} />
              <Tooltip cursor={{ fill: "transparent" }} contentStyle={tip} />
              <Bar dataKey="count" name="Faults" radius={[0, 4, 4, 0]}>{stats.by_type.map((d, i) => <Cell key={d.key} fill={palette[i % 5]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Faults per sim-day" testid="chart-by-day">
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={stats.by_day} margin={{ top: 5, right: 8, left: -18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d) => d.slice(5)} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "transparent" }} contentStyle={tip} />
              <Bar dataKey="count" name="Faults" fill={colors.solar} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Repeat offenders" sub="Panels with most faults" testid="top-panels">
        <ul className="space-y-2.5">
          {stats.top_panels.map((p) => (
            <li key={p.key} className="flex items-center gap-3 text-sm">
              <span className="font-mono font-bold w-12">{p.key}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-alert" style={{ width: `${(p.count / stats.top_panels[0].count) * 100}%` }} /></div>
              <span className="font-mono text-xs w-20 text-right">{p.count} · ${p.lost_usd}</span>
            </li>
          ))}
          {!stats.top_panels.length && <li className="text-sm text-muted-foreground">No faults recorded yet.</li>}
        </ul>
      </Panel>
    </>
  );
}
