import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["Panel Soiling", "Inverter Failure", "Hot-Spot", "String Disconnect", "Partial Shading"];

function FilterSelect({ value, onChange, options, placeholder, testid }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="w-[160px] h-9 text-xs" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function HistoryFilters({ f, set }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Input value={f.panel_id} onChange={(e) => set({ panel_id: e.target.value })} placeholder="Panel e.g. P-7" className="w-[140px] h-9 text-xs font-mono" data-testid="filter-panel-input" />
      <FilterSelect value={f.type} onChange={(v) => set({ type: v })} options={TYPES} placeholder="All types" testid="filter-type-select" />
      <FilterSelect value={f.severity} onChange={(v) => set({ severity: v })} options={["critical", "high"]} placeholder="All severities" testid="filter-severity-select" />
      <FilterSelect value={f.status} onChange={(v) => set({ status: v })} options={["open", "acknowledged", "resolved"]} placeholder="All statuses" testid="filter-status-select" />
    </div>
  );
}

const badge = (r) => (r.resolved ? ["Resolved", "bg-energy/15 text-energy"] : r.acknowledged ? ["Acked", "bg-cyan/15 text-cyan"] : ["Open", "bg-alert/15 text-alert"]);

export function HistoryTable({ data, page, setPage, pageSize }) {
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="history-table">
          <thead>
            <tr className="text-left eyebrow border-b">
              {["Sim time", "Panel", "Fault", "Severity", "Drop", "Residual", "Lost", "Status", "Email"].map((h) => <th key={h} className="py-2.5 pr-4 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => {
              const [label, cls] = badge(r);
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors" data-testid={`history-row-${r.id}`}>
                  <td className="py-2.5 pr-4 font-mono text-xs whitespace-nowrap">{r.timestamp.slice(0, 16).replace("T", " ")}</td>
                  <td className="py-2.5 pr-4 font-mono font-bold">{r.panel_id}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{r.type}</td>
                  <td className="py-2.5 pr-4"><span className={`text-[10px] font-bold uppercase ${r.severity === "critical" ? "text-alert" : "text-solar"}`}>{r.severity}</span></td>
                  <td className="py-2.5 pr-4 font-mono text-alert">-{r.drop_pct}%</td>
                  <td className="py-2.5 pr-4 font-mono">{r.efficiency_residual}</td>
                  <td className="py-2.5 pr-4 font-mono">${r.lost_revenue_usd}</td>
                  <td className="py-2.5 pr-4"><span className={`text-[10px] font-bold uppercase rounded px-2 py-0.5 ${cls}`}>{label}</span></td>
                  <td className="py-2.5 pr-4 text-xs">{r.emailed ? "✓" : "—"}</td>
                </tr>
              );
            })}
            {!data.items.length && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No incidents match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
        <span data-testid="history-total">{data.total} incidents</span>
        <Button size="icon" variant="outline" className="ml-auto h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="history-prev-btn"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-mono" data-testid="history-page">{page + 1} / {pages}</span>
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} data-testid="history-next-btn"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
