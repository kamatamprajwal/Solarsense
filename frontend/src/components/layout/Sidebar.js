import { NavLink } from "react-router-dom";
import { Activity, Bot, Cpu, FlaskConical, LayoutGrid, SlidersHorizontal, Sun, X } from "lucide-react";
import { useTwin } from "@/context/TwinContext";

export const NAV = [
  { to: "/", label: "Overview", sub: "Live telemetry", icon: Activity, id: "overview" },
  { to: "/array", label: "Panel Array", sub: "Digital twin map", icon: LayoutGrid, id: "array" },
  { to: "/predictor", label: "What-If Predictor", sub: "XGBoost inference", icon: SlidersHorizontal, id: "predictor" },
  { to: "/ml-lab", label: "ML Lab", sub: "Model & DBSCAN", icon: FlaskConical, id: "ml-lab" },
  { to: "/assistant", label: "AI Copilot", sub: "Maintenance advice", icon: Bot, id: "assistant" },
  { to: "/architecture", label: "Architecture", sub: "Pipeline & controls", icon: Cpu, id: "architecture" },
];

export function Sidebar({ mobileOpen, onClose }) {
  const { status } = useTwin();
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        data-testid="sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r bg-card flex flex-col transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center gap-3 px-6 h-16 border-b">
          <div className="h-9 w-9 rounded-lg bg-solar/15 text-solar grid place-items-center">
            <Sun className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-none tracking-tight">SolarSense</div>
            <div className="text-[10px] font-mono text-muted-foreground mt-1">PREDICTIVE O&amp;M · v2.0</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={onClose} data-testid="sidebar-close-btn"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1">
          <div className="eyebrow px-3 mb-3">Control Room</div>
          {NAV.map(({ to, label, sub, icon: Icon, id }) => (
            <NavLink
              key={to} to={to} end onClick={onClose} data-testid={`nav-${id}`}
              className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 ${isActive ? "bg-solar/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-4 w-4 ${isActive ? "text-solar" : ""}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="text-[11px] opacity-70 truncate">{sub}</div>
                  </div>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-solar" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-lg border p-4 bg-background/60" data-testid="sidebar-fleet-health">
          <div className="eyebrow">Fleet health</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold">{status?.fleet_health_pct ?? "--"}</span>
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-energy transition-[width] duration-700" style={{ width: `${status?.fleet_health_pct ?? 0}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground font-mono">{status?.healthy_panels ?? "--"}/{status?.panel_count ?? 48} panels nominal</div>
        </div>
      </aside>
    </>
  );
}
