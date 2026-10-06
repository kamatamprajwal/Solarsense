import { useEffect, useState } from "react";
import { Mail, Send, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/common";
import { api } from "@/lib/api";

export function AlertSettingsCard({ onSent }) {
  const [s, setS] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.alertSettings().then(setS); }, []);
  if (!s) return null;

  const addRecipient = () => {
    const e = draft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Enter a valid email");
    if (s.recipients.includes(e) || s.recipients.length >= 5) return;
    setS({ ...s, recipients: [...s.recipients, e] }); setDraft("");
  };
  const save = async () => {
    try { setS(await api.saveAlertSettings(s)); toast.success("Alert settings saved"); }
    catch { toast.error("Could not save settings"); }
  };
  const test = async () => {
    setBusy(true);
    try { await api.testAlert(); toast.success("Test alert sent"); onSent?.(); }
    catch (e) { toast.error(e.response?.data?.detail || "Test failed"); }
    setBusy(false);
  };

  return (
    <Panel title="Fault alert emails" sub="One digest email per cooldown window" testid="alert-settings-card"
      right={<Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} data-testid="alerts-enabled-switch" />}>
      <div className="space-y-5">
        <div>
          <div className="eyebrow mb-2">Maintenance team (max 5)</div>
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())} placeholder="crew@yourcompany.com" data-testid="recipient-input" />
            <Button variant="outline" onClick={addRecipient} data-testid="add-recipient-btn">Add</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3" data-testid="recipient-list">
            {s.recipients.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-mono">
                <Mail className="h-3 w-3" />{r}
                <button onClick={() => setS({ ...s, recipients: s.recipients.filter((x) => x !== r) })} data-testid={`remove-recipient-${r}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {!s.recipients.length && <span className="text-xs text-muted-foreground">No recipients yet — alerts are not sent.</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">Trigger on
            <Select value={s.min_severity} onValueChange={(v) => setS({ ...s, min_severity: v })}>
              <SelectTrigger className="mt-1" data-testid="severity-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical only (≥50%)</SelectItem>
                <SelectItem value="high">High + critical</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-xs text-muted-foreground">Cooldown (min)
            <Input type="number" min={1} max={1440} value={s.cooldown_minutes} onChange={(e) => setS({ ...s, cooldown_minutes: Number(e.target.value) })} className="mt-1 font-mono" data-testid="cooldown-input" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={save} data-testid="save-alert-settings-btn"><Save className="h-4 w-4 mr-1.5" />Save</Button>
          <Button variant="outline" onClick={test} disabled={busy || !s.recipients.length} data-testid="send-test-alert-btn"><Send className="h-4 w-4 mr-1.5" />Send test</Button>
        </div>
      </div>
    </Panel>
  );
}
