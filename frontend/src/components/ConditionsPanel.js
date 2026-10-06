import { Cloud, Gauge, Thermometer, Sun } from "lucide-react";
import { useTwin } from "@/context/TwinContext";
import { fmt } from "@/lib/api";

function Meter({ icon: Icon, label, value, unit, pct, tone }) {
  return (
    <div data-testid={`condition-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 text-${tone}`} /> {label}
        <span className="ml-auto font-mono text-sm font-bold text-foreground">{value}<span className="text-muted-foreground text-[11px] ml-0.5">{unit}</span></span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full bg-${tone} transition-[width] duration-700`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

export function ConditionsPanel() {
  const { latest } = useTwin();
  const l = latest || {};
  const delta = l.module_temp_c != null ? l.module_temp_c - l.ambient_temp_c : null;
  return (
    <div className="space-y-5">
      <Meter icon={Sun} label="Irradiance" value={fmt(l.solar_irradiance_w_m2, 0)} unit=" W/m²" pct={(l.solar_irradiance_w_m2 || 0) / 10} tone="solar" />
      <Meter icon={Thermometer} label="Ambient temp" value={fmt(l.ambient_temp_c)} unit=" °C" pct={((l.ambient_temp_c || 0) / 45) * 100} tone="cyan" />
      <Meter icon={Gauge} label="Module temp" value={fmt(l.module_temp_c)} unit=" °C" pct={((l.module_temp_c || 0) / 75) * 100} tone="alert" />
      <Meter icon={Cloud} label="Cloud cover" value={fmt(l.cloud_cover_pct, 0)} unit=" %" pct={l.cloud_cover_pct || 0} tone="violet" />
      <div className="rounded-lg bg-muted/60 p-3 text-[11px] text-muted-foreground leading-relaxed">
        Module running <span className="font-mono font-bold text-foreground">{delta != null ? delta.toFixed(1) : "--"}°C</span> above ambient.
        {l.module_temp_c > 55 ? " Thermal derating active (-0.4%/°C above 25°C)." : " Thermal losses within nominal range."}
      </div>
    </div>
  );
}
