import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Bot, Copy, Download, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTwin } from "@/context/TwinContext";
import { PageHeader } from "@/components/common";
import { API, api } from "@/lib/api";

const QUICK = [
  "Summarize current array health and open alerts",
  "Explain the most recent anomaly and its likely root cause",
  "Generate a prioritized maintenance schedule for this week",
  "Calculate the ROI of cleaning soiled panels now",
  "Why is module temperature affecting yield right now?",
];

const getSession = () => {
  let s = localStorage.getItem("ss-session");
  if (!s) { s = `ops-${crypto.randomUUID()}`; localStorage.setItem("ss-session", s); }
  return s;
};

function Message({ m, i }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex gap-3 reveal ${isUser ? "flex-row-reverse" : ""}`} data-testid={`chat-message-${i}`}>
      <div className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center ${isUser ? "bg-foreground text-background" : "bg-solar/15 text-solar"}`}>{isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
      <div className={`group max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${isUser ? "bg-foreground text-background" : "border bg-card"}`}>
        {isUser ? m.content : <div className="prose-chat"><ReactMarkdown>{m.content || "…"}</ReactMarkdown></div>}
        {!isUser && m.content && (
          <button onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }} className="mt-2 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`copy-message-${i}`}><Copy className="h-3 w-3" />Copy</button>
        )}
      </div>
    </div>
  );
}

export default function Assistant() {
  const { status, anomalies } = useTwin();
  const [params, setParams] = useSearchParams();
  const [session] = useState(getSession);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { api.history(session).then(setMessages).catch(() => {}); }, [session]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const q = params.get("q");
    if (q) { setInput(q); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput(""); setBusy(true);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`${API}/assistant/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: session, message: msg }) });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop();
        for (const p of parts) {
          const data = p.replace(/^data: /, "");
          if (data === "[DONE]") continue;
          const ev = JSON.parse(data);
          if (ev.error) toast.error("Copilot error", { description: ev.error });
          if (ev.delta) setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + ev.delta }; return c; });
        }
      }
    } catch (e) {
      toast.error("Could not reach Copilot");
    }
    setBusy(false);
  };

  const clear = async () => { await api.clearHistory(session); setMessages([]); };
  const exportChat = () => {
    const md = messages.map((m) => `### ${m.role === "user" ? "Operator" : "SolarSense Copilot"}\n\n${m.content}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    Object.assign(document.createElement("a"), { href: url, download: "solarsense_diagnostic_report.md" }).click();
  };

  return (
    <div>
      <PageHeader eyebrow="AI Copilot · Gemini 3 Flash" title="Maintenance assistant" desc="Grounded in the live digital twin: every question is answered with the current telemetry, open anomalies and panel health."
        actions={<>
          <Button variant="outline" size="sm" onClick={exportChat} disabled={!messages.length} data-testid="export-chat-btn"><Download className="h-4 w-4 mr-1.5" />Export report</Button>
          <Button variant="outline" size="sm" onClick={clear} disabled={!messages.length} data-testid="clear-chat-btn"><Trash2 className="h-4 w-4 mr-1.5" />Clear</Button>
        </>} />
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <aside className="space-y-4 xl:order-2">
          <div className="panel p-5">
            <div className="eyebrow mb-3">Live context sent</div>
            <ul className="space-y-2 text-sm font-mono">
              <li className="flex"><span className="text-muted-foreground">PR</span><span className="ml-auto font-bold">{status?.performance_ratio_pct ?? "--"}%</span></li>
              <li className="flex"><span className="text-muted-foreground">Fleet health</span><span className="ml-auto font-bold">{status?.fleet_health_pct ?? "--"}%</span></li>
              <li className="flex"><span className="text-muted-foreground">Recent alerts</span><span className="ml-auto font-bold text-alert">{anomalies.length}</span></li>
              <li className="flex"><span className="text-muted-foreground">Unhealthy panels</span><span className="ml-auto font-bold">{status ? status.panel_count - status.healthy_panels : "--"}</span></li>
            </ul>
          </div>
          <div className="panel p-5">
            <div className="eyebrow mb-3">Quick prompts</div>
            <div className="space-y-2">
              {QUICK.map((q, i) => <button key={q} onClick={() => send(q)} disabled={busy} data-testid={`quick-prompt-${i}`} className="w-full text-left text-sm rounded-lg border px-3 py-2.5 hover:border-solar hover:bg-solar/5 transition-colors disabled:opacity-50">{q}</button>)}
            </div>
          </div>
        </aside>
        <div className="xl:col-span-3 panel flex flex-col h-[68vh]" data-testid="chat-panel">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5" data-testid="chat-messages">
            {!messages.length && (
              <div className="h-full grid place-items-center text-center">
                <div><Bot className="h-10 w-10 mx-auto text-solar" /><p className="mt-3 font-display font-semibold text-lg">Ask about faults, cleaning ROI or maintenance plans</p><p className="text-sm text-muted-foreground mt-1">Try a quick prompt on the right.</p></div>
              </div>
            )}
            {messages.map((m, i) => <Message key={i} m={m} i={i} />)}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t p-3 sm:p-4 flex gap-2 items-end">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask the Copilot… (Enter to send)" rows={2} className="resize-none" data-testid="chat-input" />
            <Button type="submit" disabled={busy || !input.trim()} size="icon" className="h-11 w-11 shrink-0" data-testid="chat-send-btn"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </div>
    </div>
  );
}
