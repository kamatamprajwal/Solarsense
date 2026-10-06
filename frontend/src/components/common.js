export function PageHeader({ eyebrow, title, desc, actions }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end gap-4 mb-8 reveal">
      <div className="max-w-2xl">
        <div className="eyebrow text-solar">{eyebrow}</div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">{title}</h1>
        {desc && <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">{desc}</p>}
      </div>
      {actions && <div className="md:ml-auto flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, sub, right, children, className = "", testid }) {
  return (
    <section className={`panel p-5 sm:p-6 reveal ${className}`} data-testid={testid}>
      {(title || right) && (
        <div className="flex items-start gap-3 mb-5">
          <div>
            <h3 className="font-display font-semibold text-base sm:text-lg tracking-tight">{title}</h3>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function ChartTip({ active, payload, label, unit = "kWh" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-xl text-xs font-mono">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-bold pl-4">{typeof p.value === "number" ? p.value.toFixed(2) : p.value} {unit}</span>
        </div>
      ))}
    </div>
  );
}
