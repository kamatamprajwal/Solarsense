import { Cloud, CloudRain, Sun, Star } from "lucide-react";

export function DayCard({ d, i, selected, onSelect }) {
  const Icon = d.rain_likely ? CloudRain : d.avg_cloud_pct > 45 ? Cloud : Sun;
  const date = new Date(`${d.date}T00:00:00`);
  return (
    <button
      onClick={() => d.workable && onSelect(d.date)} disabled={!d.workable} data-testid={`plan-day-${i}`}
      className={`relative panel p-4 text-left reveal transition-[transform,border-color] duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 ${selected ? "!border-solar ring-2 ring-solar/30" : ""} ${d.recommended ? "!border-energy" : ""}`}
      style={{ animationDelay: `${i * 50}ms` }}
    >
      {d.recommended && <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-energy text-white text-[10px] font-bold px-2 py-0.5" data-testid="recommended-badge"><Star className="h-3 w-3" />BEST DAY</span>}
      <div className="eyebrow">{date.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div className="font-display font-bold text-lg">{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      <Icon className={`h-6 w-6 mt-3 ${d.rain_likely ? "text-cyan" : d.avg_cloud_pct > 45 ? "text-muted-foreground" : "text-solar"}`} />
      <div className="mt-3 font-mono text-sm font-bold">{d.forecast_kwh} <span className="text-[10px] text-muted-foreground">kWh</span></div>
      <div className="font-mono text-[11px] text-muted-foreground">{d.avg_cloud_pct}% cloud</div>
      <div className={`mt-2 font-mono text-xs font-bold ${d.net_benefit_usd > 0 ? "text-energy" : "text-alert"}`}>{d.net_benefit_usd > 0 ? "+" : ""}${d.net_benefit_usd}</div>
      <div className="text-[10px] text-muted-foreground">{d.rain_likely ? "Rain — crew off" : "net if cleaned"}</div>
    </button>
  );
}
