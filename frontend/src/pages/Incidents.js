import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, CheckCircle2, DollarSign, Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTwin } from "@/context/TwinContext";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader, Panel } from "@/components/common";
import { HistoryFilters, HistoryTable } from "@/components/incidents/HistoryTable";
import { IncidentCharts } from "@/components/incidents/IncidentCharts";
import { AlertSettingsCard } from "@/components/incidents/AlertSettingsCard";
import { EmailLog } from "@/components/incidents/EmailLog";
import { api, downloadCsv } from "@/lib/api";

const PAGE = 15;
const clean = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v));

export default function Incidents() {
  const { status } = useTwin();
  const [filters, setFilters] = useState({ panel_id: "", type: "", severity: "", status: "" });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [stats, setStats] = useState(null);
  const [log, setLog] = useState([]);

  const load = useCallback(() => {
    api.historyList({ ...clean(filters), limit: PAGE, skip: page * PAGE }).then(setData);
    api.historyStats().then(setStats);
    api.emailLog().then(setLog);
  }, [filters, page]);

  useEffect(() => { load(); }, [load, status?.total_anomalies]);

  const exportAll = async () => {
    const all = await api.historyList({ ...clean(filters), limit: 5000 });
    downloadCsv(all.items, "solarsense_incident_history.csv");
  };

  return (
    <div>
      <PageHeader eyebrow="Incident log" title="Anomaly history" desc="Every fault the digital twin detects is stored permanently. Servicing a panel resolves its open incidents."
        actions={<Button variant="outline" size="sm" onClick={exportAll} data-testid="export-history-btn"><Download className="h-4 w-4 mr-1.5" />Export history CSV</Button>} />
      {stats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <KpiCard testid="history-kpi-total" label="All incidents" value={stats.total} icon={ShieldAlert} tone="solar" hint={`${stats.critical} critical`} />
          <KpiCard testid="history-kpi-open" label="Open" value={stats.open} icon={AlertOctagon} tone="alert" hint="not acknowledged" delay={60} />
          <KpiCard testid="history-kpi-resolved" label="Resolved" value={stats.resolved} icon={CheckCircle2} tone="energy" hint="panel serviced" delay={120} />
          <KpiCard testid="history-kpi-lost" label="Revenue lost" value={`$${stats.lost_revenue_usd}`} icon={DollarSign} tone="violet" hint="across all incidents" delay={180} />
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel className="xl:col-span-2" title="Incident history" testid="panel-history">
          <HistoryFilters f={filters} set={(p) => { setFilters((f) => ({ ...f, ...p })); setPage(0); }} />
          <HistoryTable data={data} page={page} setPage={setPage} pageSize={PAGE} />
        </Panel>
        <div className="space-y-6">
          <AlertSettingsCard onSent={load} />
          <EmailLog log={log} />
        </div>
        {stats && <IncidentCharts stats={stats} />}
      </div>
    </div>
  );
}
