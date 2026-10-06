import { Check, MessageSquareText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTwin } from "@/context/TwinContext";
import { api } from "@/lib/api";

export function AnomalyFeed({ compact = false }) {
  const { anomalies, refresh } = useTwin();
  const navigate = useNavigate();
  const list = [...anomalies].reverse();

  const ack = async (id) => { await api.ack(id); refresh(); };
  const ask = (a) => navigate(`/assistant?q=${encodeURIComponent(`Diagnose the ${a.type} anomaly on panel ${a.panel_id} at ${a.timestamp.slice(11, 16)} (yield dropped ${a.drop_pct}%). What is the root cause and what should the crew do?`)}`);

  if (!list.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="anomaly-feed-empty">
        No anomalies detected yet. All strings operating within tolerance.
      </div>
    );
  }
  return (
    <ul className="space-y-2.5" data-testid="anomaly-feed">
      {list.map((a, i) => (
        <li key={a.id} className={`rounded-lg border p-3.5 reveal transition-opacity ${a.acknowledged ? "opacity-55" : ""}`} style={{ animationDelay: `${i * 40}ms` }} data-testid={`anomaly-item-${a.panel_id}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${a.severity === "critical" ? "bg-alert" : "bg-solar"}`} />
            <span className="font-mono font-bold text-sm">{a.panel_id}</span>
            <span className="text-sm font-medium truncate">{a.type}</span>
            <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${a.severity === "critical" ? "bg-alert/15 text-alert" : "bg-solar/15 text-solar"}`}>{a.severity}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
            <span>{a.timestamp.slice(11, 16)}</span>
            <span className="text-alert">-{a.drop_pct}%</span>
            <span>{a.efficiency_residual} kWh</span>
            {!compact && <span>${a.lost_revenue_usd} lost</span>}
            <div className="ml-auto flex gap-1">
              <button onClick={() => ask(a)} className="p-1.5 rounded hover:bg-accent" title="Ask Copilot" data-testid={`anomaly-ask-${a.id}`}><MessageSquareText className="h-3.5 w-3.5" /></button>
              {!a.acknowledged && <button onClick={() => ack(a.id)} className="p-1.5 rounded hover:bg-accent" title="Acknowledge" data-testid={`anomaly-ack-${a.id}`}><Check className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
