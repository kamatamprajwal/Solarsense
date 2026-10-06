import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const http = axios.create({ baseURL: API });

export const api = {
  telemetry: () => http.get("/telemetry").then((r) => r.data),
  anomalies: () => http.get("/anomalies").then((r) => r.data),
  status: () => http.get("/simulator/status").then((r) => r.data),
  panels: () => http.get("/panels").then((r) => r.data),
  forecast: () => http.get("/forecast").then((r) => r.data),
  metrics: () => http.get("/ml/metrics").then((r) => r.data),
  clusters: () => http.get("/ml/clusters").then((r) => r.data),
  predict: (body) => http.post("/predict", body).then((r) => r.data),
  control: (body) => http.post("/simulator/control", body).then((r) => r.data),
  inject: () => http.post("/simulator/inject").then((r) => r.data),
  reset: () => http.post("/simulator/reset").then((r) => r.data),
  ack: (id) => http.post(`/anomalies/${id}/ack`).then((r) => r.data),
  service: (id) => http.post(`/panels/${id}/service`).then((r) => r.data),
  historyList: (params) => http.get("/history/anomalies", { params }).then((r) => r.data),
  historyStats: () => http.get("/history/stats").then((r) => r.data),
  alertSettings: () => http.get("/alerts/settings").then((r) => r.data),
  saveAlertSettings: (body) => http.put("/alerts/settings", body).then((r) => r.data),
  testAlert: () => http.post("/alerts/test").then((r) => r.data),
  emailLog: () => http.get("/alerts/log").then((r) => r.data),
  alertStatus: () => http.get("/alerts/status").then((r) => r.data),
  cleaningPlan: (params) => http.get("/maintenance/cleaning-plan", { params }).then((r) => r.data),
  jobs: () => http.get("/maintenance/jobs").then((r) => r.data),
  createJob: (body) => http.post("/maintenance/jobs", body).then((r) => r.data),
  completeJob: (id) => http.post(`/maintenance/jobs/${id}/complete`).then((r) => r.data),
  history: (sid) => http.get(`/assistant/history/${sid}`).then((r) => r.data),
  clearHistory: (sid) => http.delete(`/assistant/history/${sid}`).then((r) => r.data),
};

export function downloadCsv(rows, filename) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const fmtHour = (iso) => (iso ? `${iso.slice(11, 13)}:00` : "--");
export const fmt = (v, d = 1) => (v === null || v === undefined ? "--" : Number(v).toFixed(d));
