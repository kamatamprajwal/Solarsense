import { Activity, AlertTriangle, BatteryCharging, DollarSign, Gauge, Leaf, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTwin } from "@/context/TwinContext";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader, Panel } from "@/components/common";
import { YieldChart } from "@/components/charts/YieldChart";
import { ResidualChart } from "@/components/charts/ResidualChart";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { AnomalyFeed } from "@/components/AnomalyFeed";
import { ConditionsPanel } from "@/components/ConditionsPanel";
import { downloadCsv, fmt } from "@/lib/api";

const HERO = "https://images.unsplash.com/photo-1674606071893-2a9023075f70?crop=entropy&cs=srgb&fm=jpg&q=80&w=1600";

function Hero() {
  const { status, latest } = useTwin();
  return (
    <div className="relative overflow-hidden rounded-xl border mb-6 reveal" data-testid="overview-hero">
      <img src={HERO} alt="Solar array" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/65" />
      <div className="relative p-6 sm:p-8 text-white flex flex-col lg:flex-row gap-6 lg:items-end">
        <div className="max-w-xl">
          <div className="eyebrow !text-amber-400">Site · Array A · {status?.capacity_kw ?? "--"} kWp · 48 modules</div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mt-2">Live digital twin</h1>
          <p className="text-sm sm:text-base text-slate-300 mt-2">XGBoost predicts what the array <em>should</em> produce every simulated hour. Any gap is a residual — big gaps are hardware faults.</p>
        </div>
        <div className="lg:ml-auto grid grid-cols-3 gap-6 font-mono">
          <div><div className="text-[10px] uppercase tracking-widest text-slate-400">Now</div><div className="text-2xl font-bold text-amber-400" data-testid="hero-current-yield">{fmt(latest?.actual_yield_kwh, 2)}</div><div className="text-[11px] text-slate-400">kWh/h</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-slate-400">PR</div><div className="text-2xl font-bold text-emerald-400">{fmt(status?.performance_ratio_pct)}</div><div className="text-[11px] text-slate-400">%</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-slate-400">Faults</div><div className="text-2xl font-bold text-red-400">{status?.total_anomalies ?? 0}</div><div className="text-[11px] text-slate-400">total</div></div>
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  const { telemetry, anomalies, latest, status } = useTwin();
  const eff = latest?.efficiency_pct;
  return (
    <div>
      <Hero />
      <PageHeader
        eyebrow="Overview"
        title="Array performance"
        desc="Rolling 24-hour window, refreshed every simulator tick."
        actions={<>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(telemetry, "solarsense_telemetry.csv")} data-testid="export-telemetry-btn"><Download className="h-4 w-4 mr-1.5" />Telemetry CSV</Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(anomalies, "solarsense_anomalies.csv")} data-testid="export-anomalies-btn"><Download className="h-4 w-4 mr-1.5" />Anomalies CSV</Button>
        </>}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard testid="kpi-current-yield" label="Actual yield" value={fmt(latest?.actual_yield_kwh, 2)} unit="kWh" icon={BatteryCharging} tone="solar" hint={`exp. ${fmt(latest?.expected_yield_kwh, 2)}`} />
        <KpiCard testid="kpi-efficiency" label="Efficiency" value={fmt(eff)} unit="%" icon={Gauge} tone={eff && eff < 80 ? "alert" : "energy"} hint="actual / expected" delay={60} />
        <KpiCard testid="kpi-energy-total" label="Energy total" value={fmt(status?.total_energy_kwh, 0)} unit="kWh" icon={Activity} tone="cyan" hint={`since ${status?.started_at?.slice(11, 16) ?? "--"} UTC`} delay={120} />
        <KpiCard testid="kpi-revenue" label="Revenue" value={`$${fmt(status?.revenue_usd, 2)}`} icon={DollarSign} tone="energy" hint={`-$${fmt(status?.lost_revenue_usd, 2)} lost to faults`} delay={180} />
        <KpiCard testid="kpi-co2" label="CO₂ avoided" value={fmt(status?.co2_avoided_kg, 0)} unit="kg" icon={Leaf} tone="violet" hint="0.42 kg/kWh grid factor" delay={240} />
        <KpiCard testid="kpi-anomalies" label="Open alerts" value={anomalies.filter((a) => !a.acknowledged).length} icon={AlertTriangle} tone="alert" hint={`${status?.total_anomalies ?? 0} detected total`} delay={300} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel className="xl:col-span-2" title="Expected vs actual yield" sub="Red dots mark injected hardware anomalies" testid="panel-yield">
          <YieldChart />
        </Panel>
        <Panel title="Anomaly stream" sub="8 most recent severe faults" testid="panel-anomalies">
          <div className="max-h-[300px] overflow-y-auto pr-1"><AnomalyFeed compact /></div>
        </Panel>
        <Panel className="xl:col-span-2" title="Efficiency residual" sub="actual − expected · negative = underperformance" testid="panel-residual">
          <ResidualChart />
        </Panel>
        <Panel title="Current conditions" sub={latest ? `Hour ${latest.hour_of_day}:00 sim-time` : ""} testid="panel-conditions">
          <ConditionsPanel />
        </Panel>
        <Panel className="xl:col-span-3" title="24-hour yield forecast" sub="XGBoost run over projected weather vs clear-sky potential" testid="panel-forecast">
          <ForecastChart />
        </Panel>
      </div>
    </div>
  );
}
