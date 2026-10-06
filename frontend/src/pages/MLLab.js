import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Legend, ReferenceLine } from "recharts";
import { useTwin } from "@/context/TwinContext";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader, Panel } from "@/components/common";
import { api } from "@/lib/api";
import { Target, Sigma, Ruler, TrendingUp } from "lucide-react";

const PRETTY = { hour_of_day: "Hour", ambient_temp_c: "Ambient °C", module_temp_c: "Module °C", solar_irradiance_w_m2: "Irradiance", cloud_cover_pct: "Cloud %" };

function FeatureImportance({ m }) {
  const { colors } = useTwin();
  const data = Object.entries(m.feature_importance).map(([k, v]) => ({ name: PRETTY[k], v })).sort((a, b) => b.v - a.v);
  return (
    <div style={{ height: 240 }} data-testid="feature-importance-chart">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={80} />
          <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="v" name="Importance" radius={[0, 4, 4, 0]}>{data.map((d, i) => <Cell key={d.name} fill={i === 0 ? colors.solar : colors.cyan} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PredVsActual({ m }) {
  const { colors } = useTwin();
  const max = Math.max(...m.pred_vs_actual_sample.map((d) => d.actual), 1);
  return (
    <div style={{ height: 240 }} data-testid="pred-vs-actual-chart">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="actual" name="Actual" tickLine={false} axisLine={false} domain={[0, Math.ceil(max)]} />
          <YAxis type="number" dataKey="predicted" name="Predicted" tickLine={false} axisLine={false} domain={[0, Math.ceil(max)]} />
          <ZAxis range={[18, 18]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: Math.ceil(max), y: Math.ceil(max) }]} stroke={colors.muted} strokeDasharray="4 4" />
          <Tooltip contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 }} />
          <Scatter data={m.pred_vs_actual_sample} fill={colors.solar} fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClusterPlot({ c }) {
  const { colors } = useTwin();
  const normal = c.points.filter((p) => p.cluster !== -1);
  const noise = c.points.filter((p) => p.cluster === -1);
  return (
    <div style={{ height: 380 }} data-testid="dbscan-cluster-chart">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="pc1" name="PC1" tickLine={false} axisLine={false} />
          <YAxis type="number" dataKey="pc2" name="PC2" tickLine={false} axisLine={false} />
          <ZAxis range={[16, 16]} />
          <Tooltip contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Scatter name="Normal operation" data={normal} fill={colors.energy} fillOpacity={0.45} />
          <Scatter name="Anomaly (label −1)" data={noise} fill={colors.alert} fillOpacity={0.85} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResidualHistogram({ c }) {
  const { colors } = useTwin();
  return (
    <div style={{ height: 240 }} data-testid="residual-histogram-chart">
      <ResponsiveContainer>
        <BarChart data={c.residual_histogram} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="bin" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} scale="sqrt" />
          <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>{c.residual_histogram.map((d) => <Cell key={d.bin} fill={d.bin < -2 ? colors.alert : colors.violet} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MLLab() {
  const [m, setM] = useState(null);
  const [c, setC] = useState(null);
  useEffect(() => { api.metrics().then(setM); api.clusters().then(setC); }, []);
  if (!m || !c) return <div className="text-muted-foreground" data-testid="ml-lab-loading">Loading model artifacts…</div>;
  return (
    <div>
      <PageHeader eyebrow="ML Lab" title="Model & anomaly engine" desc={`XGBoost regressor trained on ${m.n_train.toLocaleString()} rows, evaluated on ${m.n_test.toLocaleString()}. DBSCAN scans ${c.n_samples.toLocaleString()} daylight samples for hardware degradation.`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard testid="metric-mae" label="MAE" value={m.mae.toFixed(3)} unit="kWh" icon={Target} tone="solar" hint="mean absolute error" />
        <KpiCard testid="metric-mse" label="MSE" value={m.mse.toFixed(3)} unit="kWh²" icon={Sigma} tone="cyan" hint="mean squared error" delay={60} />
        <KpiCard testid="metric-rmse" label="RMSE" value={m.rmse.toFixed(3)} unit="kWh" icon={Ruler} tone="violet" hint="root mean squared" delay={120} />
        <KpiCard testid="metric-r2" label="R²" value={m.r2.toFixed(4)} icon={TrendingUp} tone="energy" hint="variance explained" delay={180} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Feature importance" sub="XGBoost gain-based importance" testid="panel-feature-importance"><FeatureImportance m={m} /></Panel>
        <Panel title="Predicted vs actual" sub="300-point test-set sample · dashed = perfect fit" testid="panel-pred-vs-actual"><PredVsActual m={m} /></Panel>
        <Panel className="xl:col-span-2" title="DBSCAN clusters in PCA space" sub={`eps=${c.eps} · min_samples=${c.min_samples} · PCA explains ${(c.explained_variance.reduce((a, b) => a + b, 0) * 100).toFixed(1)}% variance`} testid="panel-dbscan"
          right={<div className="flex gap-6 font-mono text-right">
            <div><div className="text-[10px] uppercase text-muted-foreground">Normal</div><div className="text-xl font-bold text-energy" data-testid="dbscan-normal-count">{c.n_normal.toLocaleString()}</div></div>
            <div><div className="text-[10px] uppercase text-muted-foreground">Anomalies</div><div className="text-xl font-bold text-alert" data-testid="dbscan-anomaly-count">{c.n_anomalies.toLocaleString()}</div></div>
            <div><div className="text-[10px] uppercase text-muted-foreground">Rate</div><div className="text-xl font-bold">{c.anomaly_rate_pct}%</div></div>
          </div>}>
          <ClusterPlot c={c} />
        </Panel>
        <Panel title="Residual distribution" sub="Historical efficiency_residual · red tail = degradation" testid="panel-residual-hist"><ResidualHistogram c={c} /></Panel>
        <Panel title="Cluster diagnostics" testid="panel-cluster-diagnostics">
          <dl className="divide-y text-sm">
            {[["Mean residual · anomalies", `${c.mean_residual_anomaly} kWh`], ["Mean residual · normal", `${c.mean_residual_normal} kWh`], ["Dense clusters found", c.n_clusters], ["PC1 / PC2 variance", c.explained_variance.map((v) => `${(v * 100).toFixed(1)}%`).join(" / ")], ["Clustering features", "irradiance, module temp, residual"], ["Hyperparameters (XGB)", `${m.hyperparameters.n_estimators} trees · depth ${m.hyperparameters.max_depth} · lr ${m.hyperparameters.learning_rate}`]].map(([k, v]) => (
              <div key={k} className="flex py-3"><dt className="text-muted-foreground">{k}</dt><dd className="ml-auto font-mono font-semibold text-right">{v}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
