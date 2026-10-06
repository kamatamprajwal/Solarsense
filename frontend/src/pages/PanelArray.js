import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Wrench, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useTwin } from "@/context/TwinContext";
import { PageHeader, Panel } from "@/components/common";
import { api } from "@/lib/api";

const STATUS = {
  healthy: { label: "Healthy", cls: "bg-energy/15 border-energy/40 text-energy", dot: "bg-energy" },
  degrading: { label: "Degrading", cls: "bg-solar/15 border-solar/50 text-solar", dot: "bg-solar" },
  soiled: { label: "Soiled", cls: "bg-violet/15 border-violet/50 text-violet", dot: "bg-violet" },
  faulted: { label: "Faulted", cls: "bg-alert/20 border-alert/60 text-alert", dot: "bg-alert" },
};
const FILTERS = ["all", "healthy", "degrading", "soiled", "faulted"];

function PanelCell({ p, dim, onClick }) {
  const s = STATUS[p.status];
  return (
    <button
      onClick={onClick} data-testid={`panel-cell-${p.panel_id}`}
      className={`relative aspect-[3/4] rounded-md border-2 p-1.5 text-left transition-[transform,opacity] duration-300 hover:scale-[1.06] hover:z-10 ${s.cls} ${dim ? "opacity-20" : ""}`}
      style={{ backgroundImage: "linear-gradient(rgb(var(--grid-line)/.08) 1px,transparent 1px),linear-gradient(90deg,rgb(var(--grid-line)/.08) 1px,transparent 1px)", backgroundSize: "33.3% 25%" }}
      title={`${p.panel_id} · ${p.health}%`}
    >
      <div className="font-mono text-[10px] sm:text-xs font-bold text-foreground">{p.panel_id}</div>
      <div className="absolute bottom-1.5 left-1.5 right-1.5 font-mono text-[10px] sm:text-[11px] font-bold">{p.health.toFixed(0)}%</div>
      {p.status === "faulted" && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-alert live-dot text-alert" />}
    </button>
  );
}

function PanelDrawer({ panel, onClose, onService }) {
  const navigate = useNavigate();
  if (!panel) return null;
  const s = STATUS[panel.status];
  const rows = [["Health", `${panel.health}%`], ["Status", s.label], ["Grid position", `Row ${panel.row + 1} · Col ${panel.col + 1}`], ["Fault count", panel.fault_count], ["Last fault", panel.last_fault || "—"], ["Last serviced", panel.last_serviced ? panel.last_serviced.slice(0, 16).replace("T", " ") : "—"]];
  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-testid="panel-drawer">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Panel {panel.panel_id}</SheetTitle>
          <SheetDescription>Monocrystalline 410 W module · string {Math.floor(panel.row / 2) + 1}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${s.dot}`} style={{ width: `${panel.health}%` }} /></div>
        <dl className="mt-6 divide-y">
          {rows.map(([k, v]) => <div key={k} className="flex py-3 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="ml-auto font-mono font-semibold" data-testid={`panel-detail-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</dd></div>)}
        </dl>
        <div className="mt-8 grid gap-2">
          <Button onClick={() => onService(panel.panel_id)} data-testid="panel-service-btn"><Wrench className="h-4 w-4 mr-2" />Dispatch crew (clean / repair)</Button>
          <Button variant="outline" data-testid="panel-ask-copilot-btn" onClick={() => navigate(`/assistant?q=${encodeURIComponent(`Panel ${panel.panel_id} is at ${panel.health}% health, status ${panel.status}, last fault: ${panel.last_fault || "none"}, ${panel.fault_count} faults. Recommend a maintenance plan.`)}`)}>
            <MessageSquareText className="h-4 w-4 mr-2" />Ask AI Copilot
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PanelArray() {
  const { panels, refresh } = useTwin();
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const selected = panels.find((p) => p.panel_id === selectedId);
  const counts = useMemo(() => panels.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }), {}), [panels]);
  const unhealthy = panels.filter((p) => p.status !== "healthy");

  const service = async (id) => { await api.service(id); toast.success(`Crew dispatched to ${id}`, { description: "Panel restored to 100% health." }); refresh(); };
  const serviceAll = async () => { await Promise.all(unhealthy.map((p) => api.service(p.panel_id))); toast.success(`${unhealthy.length} panels serviced`); refresh(); };

  return (
    <div>
      <PageHeader eyebrow="Digital twin" title="Panel array map" desc="48 modules in a 6 × 8 layout. Health degrades when an anomaly hits a panel and slowly recovers for transient faults; faulted panels need a crew."
        actions={<Button onClick={serviceAll} disabled={!unhealthy.length} data-testid="service-all-btn"><Wrench className="h-4 w-4 mr-2" />Service {unhealthy.length} unhealthy</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(STATUS).map(([k, s]) => (
          <div key={k} className="panel p-4 flex items-center gap-3" data-testid={`status-count-${k}`}>
            <span className={`h-3 w-3 rounded-full ${s.dot}`} /><span className="text-sm font-medium">{s.label}</span>
            <span className="ml-auto font-mono text-2xl font-bold">{counts[k] || 0}</span>
          </div>
        ))}
      </div>
      <Panel title="Array A · aerial layout" sub="Click a module to inspect" testid="panel-array-grid"
        right={<div className="flex flex-wrap gap-1">{FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`} className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${filter === f ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{f}</button>
        ))}</div>}>
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5 max-w-4xl mx-auto">
          {panels.map((p) => <PanelCell key={p.panel_id} p={p} dim={filter !== "all" && p.status !== filter} onClick={() => setSelectedId(p.panel_id)} />)}
        </div>
        <div className="mt-6 flex justify-center gap-8 text-[11px] font-mono text-muted-foreground"><span>◀ WEST · INVERTER BAY</span><span>EAST ▶</span></div>
      </Panel>
      <PanelDrawer panel={selected} onClose={() => setSelectedId(null)} onService={service} />
    </div>
  );
}
