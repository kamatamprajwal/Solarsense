const TONES = {
  solar: "text-solar bg-solar/10",
  energy: "text-energy bg-energy/10",
  alert: "text-alert bg-alert/10",
  cyan: "text-cyan bg-cyan/10",
  violet: "text-violet bg-violet/10",
};

export function KpiCard({ label, value, unit, icon: Icon, tone = "solar", hint, delta, testid, delay = 0 }) {
  return (
    <div className="panel p-5 reveal group hover:-translate-y-0.5 transition-transform duration-300" style={{ animationDelay: `${delay}ms` }} data-testid={testid}>
      <div className="flex items-center gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && <span className={`ml-auto h-8 w-8 rounded-lg grid place-items-center ${TONES[tone]}`}><Icon className="h-4 w-4" /></span>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight" data-testid={`${testid}-value`}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground font-mono">{unit}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground min-h-[16px]">
        {delta !== undefined && delta !== null && (
          <span className={`font-mono font-semibold ${delta >= 0 ? "text-energy" : "text-alert"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%</span>
        )}
        <span className="truncate">{hint}</span>
      </div>
    </div>
  );
}
