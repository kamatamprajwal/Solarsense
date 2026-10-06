import { ArrowRight, Brain, Database, Download, RotateCcw, Radio, ScanSearch, Server, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTwin } from "@/context/TwinContext";
import { PageHeader, Panel } from "@/components/common";
import { api, downloadCsv } from "@/lib/api";

const STAGES = [
  { icon: Database, title: "solar_telemetry.csv", desc: "Your uploaded 8,760-row hourly dataset (2023). generate_mock_data.py remains as a synthetic fallback", out: "training data", tone: "cyan" },
  { icon: Brain, title: "supervised_xgboost.py", desc: "XGBRegressor on 5 features · 80/20 split · MAE/MSE · residuals", out: "xgboost_yield_model.pkl", tone: "solar" },
  { icon: ScanSearch, title: "unsupervised_dbscan.py", desc: "Daylight filter · StandardScaler · PCA(2) · DBSCAN → label −1 = anomaly", out: "dbscan_results.json", tone: "violet" },
  { icon: Radio, title: "api.py · Digital twin", desc: "asyncio loop every 3s · +1h sim clock · model inference · 8% fault injection", out: "REST /api/*", tone: "energy" },
  { icon: MonitorSmartphone, title: "React dashboard", desc: "Polls telemetry, renders charts, array map, predictor & AI Copilot", out: "Operator UI", tone: "alert" },
];

const ENDPOINTS = [
  ["GET", "/api/telemetry", "Rolling 24-point live telemetry"],
  ["GET", "/api/anomalies", "8 most recent anomalies"],
  ["POST", "/api/predict", "XGBoost inference on custom conditions"],
  ["GET", "/api/forecast", "24h-ahead yield forecast"],
  ["GET", "/api/panels", "48-panel fleet health"],
  ["POST", "/api/panels/{id}/service", "Dispatch maintenance crew"],
  ["POST", "/api/anomalies/{id}/ack", "Acknowledge an alert"],
  ["GET", "/api/simulator/status", "Clock, counters, revenue, PR"],
  ["POST", "/api/simulator/control", "Pause · speed · anomaly rate"],
  ["POST", "/api/simulator/inject", "Force a fault next daylight tick"],
  ["POST", "/api/simulator/reset", "Reset twin state"],
  ["GET", "/api/ml/metrics · /api/ml/clusters", "Model + DBSCAN artifacts"],
  ["POST", "/api/assistant/chat", "Streaming AI Copilot (SSE)"],
  ["GET", "/api/history/anomalies · /api/history/stats", "Permanent incident log (Mongo)"],
  ["GET/PUT", "/api/alerts/settings · POST /api/alerts/test", "Fault alert emails (Resend)"],
  ["GET", "/api/maintenance/cleaning-plan", "Optimal cleaning day planner"],
  ["POST", "/api/maintenance/jobs · /{id}/complete", "Schedule & complete crew jobs"],
];

const TREE = `solarsense/
├── data/        solar_telemetry.csv · telemetry_with_predictions.csv · dbscan_results.json
├── models/      xgboost_yield_model.pkl · model_metrics.json
├── requirements.txt
└── src/
    ├── generate_mock_data.py
    ├── supervised_xgboost.py
    ├── unsupervised_dbscan.py
    └── api.py`;

function Controls() {
  const { status, telemetry, anomalies, panels, refresh } = useTwin();
  const control = async (b) => { await api.control(b); refresh(); };
  if (!status) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-center"><span className="text-sm font-medium">Simulator running</span><Switch className="ml-auto" checked={!status.paused} onCheckedChange={(v) => control({ paused: !v })} data-testid="sim-running-switch" /></div>
      <div>
        <div className="flex text-sm mb-3"><span className="font-medium">Clock speed</span><span className="ml-auto font-mono font-bold" data-testid="speed-value">{status.speed}x · {status.tick_interval_s}s/tick</span></div>
        <Slider min={0.5} max={10} step={0.5} value={[status.speed]} onValueCommit={([v]) => control({ speed: v })} data-testid="speed-slider" />
      </div>
      <div>
        <div className="flex text-sm mb-3"><span className="font-medium">Anomaly probability</span><span className="ml-auto font-mono font-bold" data-testid="anomaly-rate-value">{(status.anomaly_rate * 100).toFixed(0)}%</span></div>
        <Slider min={0} max={0.5} step={0.01} value={[status.anomaly_rate]} onValueCommit={([v]) => control({ anomaly_rate: v })} data-testid="anomaly-rate-slider" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={async () => { await api.reset(); refresh(); toast.success("Digital twin reset"); }} data-testid="reset-sim-btn"><RotateCcw className="h-4 w-4 mr-1.5" />Reset</Button>
        <Button variant="outline" onClick={() => downloadCsv(telemetry, "telemetry.csv")} data-testid="arch-export-telemetry-btn"><Download className="h-4 w-4 mr-1.5" />Telemetry</Button>
        <Button variant="outline" onClick={() => downloadCsv(anomalies, "anomalies.csv")} data-testid="arch-export-anomalies-btn"><Download className="h-4 w-4 mr-1.5" />Anomalies</Button>
        <Button variant="outline" onClick={() => downloadCsv(panels, "panels.csv")} data-testid="arch-export-panels-btn"><Download className="h-4 w-4 mr-1.5" />Panels</Button>
      </div>
    </div>
  );
}

export default function Architecture() {
  return (
    <div>
      <PageHeader eyebrow="System design" title="Pipeline & digital twin" desc="Offline ML pipelines produce artifacts; the FastAPI twin loads them on startup and streams live state to this dashboard." />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-6">
        {STAGES.map((s, i) => (
          <div key={s.title} className="relative panel p-5 reveal" style={{ animationDelay: `${i * 80}ms` }} data-testid={`stage-${i}`}>
            <div className={`h-9 w-9 rounded-lg grid place-items-center bg-${s.tone}/10 text-${s.tone}`}><s.icon className="h-4 w-4" /></div>
            <div className="mt-4 font-mono text-[13px] font-bold">{s.title}</div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            <div className="mt-4 inline-block rounded bg-muted px-2 py-1 font-mono text-[10px]">→ {s.out}</div>
            {i < STAGES.length - 1 && <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 h-4 w-4 text-solar z-10" />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel className="xl:col-span-2" title="REST endpoints" sub="All routes served under /api" testid="panel-endpoints">
          <div className="divide-y">
            {ENDPOINTS.map(([m, p, d]) => (
              <div key={p} className="flex items-center gap-3 py-2.5 text-sm">
                <span className={`w-14 text-center rounded font-mono text-[10px] font-bold py-0.5 ${m.startsWith("GET") ? "bg-energy/15 text-energy" : "bg-solar/15 text-solar"}`}>{m}</span>
                <code className="font-mono text-xs">{p}</code>
                <span className="ml-auto text-xs text-muted-foreground text-right hidden sm:block">{d}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Simulator controls" sub="Live tuning of the digital twin" testid="panel-sim-controls"><Controls /></Panel>
        <Panel className="xl:col-span-3" title="Project layout" sub="backend/solarsense — runnable standalone (uvicorn api:app) or mounted in the platform API" testid="panel-tree"
          right={<Server className="h-4 w-4 text-muted-foreground" />}>
          <pre className="font-mono text-xs leading-6 overflow-x-auto bg-muted/50 rounded-lg p-4">{TREE}</pre>
        </Panel>
      </div>
    </div>
  );
}
