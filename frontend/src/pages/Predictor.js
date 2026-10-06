import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTwin } from "@/context/TwinContext";
import { ChartTip, PageHeader, Panel } from "@/components/common";
import { api, fmt } from "@/lib/api";

const FIELDS = [
  { key: "hour_of_day", label: "Hour of day", min: 0, max: 23, step: 1, unit: ":00" },
  { key: "ambient_temp_c", label: "Ambient temperature", min: -10, max: 50, step: 0.5, unit: "°C" },
  { key: "module_temp_c", label: "Module temperature", min: -10, max: 90, step: 0.5, unit: "°C" },
  { key: "solar_irradiance_w_m2", label: "Solar irradiance", min: 0, max: 1200, step: 10, unit: "W/m²" },
  { key: "cloud_cover_pct", label: "Cloud cover", min: 0, max: 100, step: 1, unit: "%" },
];
const PRESETS = {
  "Clear noon": { hour_of_day: 12, ambient_temp_c: 26, module_temp_c: 52, solar_irradiance_w_m2: 980, cloud_cover_pct: 5 },
  Heatwave: { hour_of_day: 14, ambient_temp_c: 42, module_temp_c: 74, solar_irradiance_w_m2: 920, cloud_cover_pct: 3 },
  Overcast: { hour_of_day: 12, ambient_temp_c: 18, module_temp_c: 24, solar_irradiance_w_m2: 260, cloud_cover_pct: 90 },
  Dawn: { hour_of_day: 7, ambient_temp_c: 14, module_temp_c: 16, solar_irradiance_w_m2: 240, cloud_cover_pct: 20 },
};

function Sensitivity({ form }) {
  const { colors } = useTwin();
  const [data, setData] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const steps = Array.from({ length: 13 }, (_, i) => i * 100);
      const res = await Promise.all(steps.map((irr) => api.predict({ ...form, solar_irradiance_w_m2: irr })));
      setData(steps.map((irr, i) => ({ label: `${irr}`, y: res[i].expected_yield_kwh })));
    }, 400);
    return () => clearTimeout(t);
  }, [form]);
  return (
    <div style={{ height: 240 }} data-testid="sensitivity-chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine x={`${Math.round(form.solar_irradiance_w_m2 / 100) * 100}`} stroke={colors.solar} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="y" name="Yield" stroke={colors.cyan} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Predictor() {
  const { latest, status } = useTwin();
  const [form, setForm] = useState(PRESETS["Clear noon"]);
  const [result, setResult] = useState(null);
  const [tariff, setTariff] = useState(0.12);
  const [hours, setHours] = useState(5);

  useEffect(() => {
    const t = setTimeout(() => api.predict(form).then((r) => setResult(r.expected_yield_kwh)), 250);
    return () => clearTimeout(t);
  }, [form]);

  const useLive = () => latest && setForm(Object.fromEntries(FIELDS.map((f) => [f.key, latest[f.key]])));
  const baseline = latest?.expected_yield_kwh;
  const diff = result != null && baseline != null ? result - baseline : null;

  return (
    <div>
      <PageHeader eyebrow="POST /api/predict" title="What-if yield predictor" desc="Tweak conditions and the trained XGBoost regressor returns expected hourly yield in real time." />
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Panel className="xl:col-span-3" title="Input conditions" testid="predictor-form"
          right={<Button size="sm" variant="outline" onClick={useLive} data-testid="use-live-btn">Use live values</Button>}>
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} onClick={() => setForm(PRESETS[p])} data-testid={`preset-${p.toLowerCase().replace(/\s/g, "-")}`} className="px-3 py-1.5 rounded-full text-xs font-semibold border hover:border-solar hover:text-solar transition-colors">{p}</button>
            ))}
          </div>
          <div className="space-y-7">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <div className="flex items-center text-sm mb-3">
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-auto font-mono font-bold" data-testid={`value-${f.key}`}>{form[f.key]}<span className="text-muted-foreground text-xs ml-0.5">{f.unit}</span></span>
                </div>
                <Slider data-testid={`slider-${f.key}`} min={f.min} max={f.max} step={f.step} value={[form[f.key]]} onValueChange={([v]) => setForm((s) => ({ ...s, [f.key]: v }))} />
              </div>
            ))}
          </div>
        </Panel>
        <div className="xl:col-span-2 space-y-6">
          <Panel testid="predictor-result">
            <div className="eyebrow">Expected yield</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-bold text-solar" data-testid="predicted-yield">{fmt(result, 2)}</span>
              <span className="text-muted-foreground font-mono">kWh / h</span>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {diff != null ? <>vs live expected <span className="font-mono">{fmt(baseline, 2)}</span> → <span className={`font-mono font-bold ${diff >= 0 ? "text-energy" : "text-alert"}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)} kWh</span></> : "Waiting for live data…"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Capacity factor <span className="font-mono font-bold text-foreground">{fmt(((result || 0) / (status?.capacity_kw || 1)) * 100)}%</span> of {status?.capacity_kw ?? "--"} kWp</div>
          </Panel>
          <Panel title="Revenue impact" sub="Sustained for N hours at your tariff" testid="revenue-calculator">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Tariff $/kWh<Input type="number" step="0.01" value={tariff} onChange={(e) => setTariff(Number(e.target.value))} className="mt-1 font-mono" data-testid="tariff-input" /></label>
              <label className="text-xs text-muted-foreground">Hours<Input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 font-mono" data-testid="hours-input" /></label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 font-mono">
              <div className="rounded-lg bg-muted/60 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Energy</div><div className="text-xl font-bold" data-testid="revenue-energy">{fmt((result || 0) * hours, 1)} kWh</div></div>
              <div className="rounded-lg bg-energy/10 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</div><div className="text-xl font-bold text-energy" data-testid="revenue-usd">${fmt((result || 0) * hours * tariff, 2)}</div></div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">A 50% fault on this output would cost <span className="font-mono font-bold text-alert">${fmt((result || 0) * hours * tariff * 0.5, 2)}</span>.</p>
          </Panel>
        </div>
        <Panel className="xl:col-span-5" title="Irradiance sensitivity curve" sub="Model output swept 0 → 1200 W/m² holding other inputs fixed" testid="panel-sensitivity">
          <Sensitivity form={form} />
        </Panel>
      </div>
    </div>
  );
}
