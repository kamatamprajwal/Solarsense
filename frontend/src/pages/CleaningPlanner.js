import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck, Droplets, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTwin } from "@/context/TwinContext";
import { PageHeader, Panel } from "@/components/common";
import { DayCard } from "@/components/cleaning/DayCard";
import { JobsList } from "@/components/cleaning/JobsList";
import { api } from "@/lib/api";

function BenefitChart({ days }) {
  const { colors } = useTwin();
  return (
    <div style={{ height: 220 }} data-testid="benefit-chart">
      <ResponsiveContainer>
        <BarChart data={days} margin={{ top: 10, right: 8, left: -10 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(d) => d.slice(5)} />
          <YAxis tickLine={false} axisLine={false} />
          <ReferenceLine y={0} stroke={colors.muted} />
          <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="net_benefit_usd" name="Net benefit $" radius={[4, 4, 4, 4]}>
            {days.map((d) => <Cell key={d.date} fill={!d.workable ? colors.muted : d.recommended ? colors.energy : d.net_benefit_usd > 0 ? colors.cyan : colors.alert} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CleaningPlanner() {
  const { status, refresh } = useTwin();
  const [params, setParams] = useState({ days: 7, tariff: 0.12, cost_per_panel: 0.02 });
  const [plan, setPlan] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const simDay = status?.sim_clock?.slice(0, 10);

  const load = useCallback(() => {
    api.cleaningPlan(params).then((p) => { setPlan(p); setSelected(p.recommendation.date); });
    api.jobs().then(setJobs);
  }, [params]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load, simDay]);

  const schedule = async () => {
    await api.createJob({ date: selected, panel_ids: plan.candidates.map((c) => c.panel_id) });
    toast.success(`Cleaning scheduled for ${selected}`); load();
  };
  const complete = async (id) => { await api.completeJob(id); toast.success("Panels cleaned — health restored"); refresh(); load(); };

  return (
    <div>
      <PageHeader eyebrow="Maintenance" title="Cleaning schedule planner" desc="Combines the XGBoost multi-day forecast with soiling losses to find the day where a crew visit recovers the most revenue. Rainy days are skipped — crews can't work and rain partially washes panels." />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel className="xl:col-span-2" title="Recommendation" testid="panel-recommendation"
          right={<div className="flex gap-1">{[7, 14].map((d) => <button key={d} onClick={() => setParams({ ...params, days: d })} data-testid={`horizon-${d}`} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${params.days === d ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{d} days</button>)}</div>}>
          {plan && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-energy/10 border border-energy/30 p-4">
                <Lightbulb className="h-5 w-5 text-energy shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm" data-testid="recommendation-message">{plan.recommendation.message}</div>
                  <div className="text-xs text-muted-foreground mt-1">Doing nothing costs <span className="font-mono font-bold text-alert">${plan.total_loss_no_action_usd}</span> over {plan.horizon_days} days · crew cost <span className="font-mono font-bold">${plan.crew_cost_usd}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-6">
                {plan.days.slice(0, 7).map((d, i) => <DayCard key={d.date} d={d} i={i} selected={selected === d.date} onSelect={setSelected} />)}
              </div>
              {plan.days.length > 7 && <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">{plan.days.slice(7).map((d, i) => <DayCard key={d.date} d={d} i={i + 7} selected={selected === d.date} onSelect={setSelected} />)}</div>}
              <Button className="mt-6" onClick={schedule} disabled={!selected || !plan.candidates.length} data-testid="schedule-cleaning-btn">
                <CalendarCheck className="h-4 w-4 mr-2" />Schedule {plan.candidates.length} panel(s) for {selected || "—"}
              </Button>
            </>
          )}
        </Panel>
        <Panel title="Economics" sub="Tune to your site" testid="panel-economics">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Tariff $/kWh<Input type="number" step="0.01" min="0.01" value={params.tariff} onChange={(e) => setParams({ ...params, tariff: Number(e.target.value) || 0.01 })} className="mt-1 font-mono" data-testid="plan-tariff-input" /></label>
            <label className="text-xs text-muted-foreground">Cost / panel $<Input type="number" step="0.01" min="0" value={params.cost_per_panel} onChange={(e) => setParams({ ...params, cost_per_panel: Number(e.target.value) || 0 })} className="mt-1 font-mono" data-testid="plan-cost-input" /></label>
          </div>
          <div className="eyebrow mt-6 mb-3">Soiled panels ({plan?.candidates.length ?? 0})</div>
          <ul className="space-y-2" data-testid="candidate-list">
            {plan?.candidates.map((c) => (
              <li key={c.panel_id} className="flex items-center gap-3 text-sm">
                <Droplets className="h-4 w-4 text-violet" />
                <span className="font-mono font-bold w-12">{c.panel_id}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-violet" style={{ width: `${c.health}%` }} /></div>
                <span className="font-mono text-xs text-alert w-14 text-right">-{c.loss_pct}%</span>
              </li>
            ))}
            {plan && !plan.candidates.length && <li className="text-sm text-muted-foreground">All panels clean. Soiling faults appear here as the twin runs.</li>}
          </ul>
        </Panel>
        <Panel className="xl:col-span-2" title="Net benefit by cleaning day" sub="Recovered revenue from that day to horizon − crew cost · grey = rain" testid="panel-benefit">
          {plan && <BenefitChart days={plan.days} />}
        </Panel>
        <JobsList jobs={jobs} onComplete={complete} />
      </div>
    </div>
  );
}
