import { Panel } from "@/components/common";

export function EmailLog({ log }) {
  return (
    <Panel title="Email log" sub="Last 30 alert emails" testid="email-log">
      {!log.length ? (
        <div className="text-sm text-muted-foreground">No alert emails sent yet.</div>
      ) : (
        <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {log.map((l) => (
            <li key={l.id} className="rounded-lg border p-3 text-xs" data-testid={`email-log-${l.id}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${l.status === "sent" ? "bg-energy" : "bg-alert"}`} />
                <span className="font-semibold truncate">{l.subject}</span>
                <span className="ml-auto uppercase text-[10px] font-bold text-muted-foreground">{l.kind}</span>
              </div>
              <div className="mt-1.5 font-mono text-muted-foreground flex gap-3 flex-wrap">
                <span>{l.sent_at.slice(0, 16).replace("T", " ")} UTC</span>
                <span>{l.recipients.length} recipient(s)</span>
                <span>{l.panels.join(", ")}</span>
              </div>
              {l.error && <div className="mt-1 text-alert">{l.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
