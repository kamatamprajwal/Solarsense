import { Menu, Moon, Pause, Play, Sun, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTwin } from "@/context/TwinContext";
import { api } from "@/lib/api";

export function Topbar({ onMenu }) {
  const { status, theme, setTheme, online, refresh } = useTwin();
  const paused = status?.paused;
  const clock = status?.sim_clock;

  const control = async (body) => { await api.control(body); refresh(); };
  const inject = async () => { await api.inject(); toast.warning("Anomaly queued", { description: "A fault will be injected on the next daylight tick." }); };

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-card/95 backdrop-blur-xl flex items-center gap-3 px-4 sm:px-6 lg:px-10" data-testid="topbar">
      <button className="lg:hidden" onClick={onMenu} data-testid="mobile-menu-btn"><Menu className="h-5 w-5" /></button>

      <div className="flex items-center gap-2.5" data-testid="live-status-indicator">
        <span className={`live-dot h-2 w-2 rounded-full ${!online ? "bg-alert text-alert" : paused ? "bg-solar text-solar" : "bg-energy text-energy"}`} />
        <span className="text-xs font-semibold tracking-wider uppercase">{!online ? "Offline" : paused ? "Paused" : "Live"}</span>
      </div>

      <div className="hidden sm:flex items-center gap-2 pl-3 border-l">
        <span className="eyebrow">Sim clock</span>
        <span className="font-mono text-sm font-bold" data-testid="sim-clock">{clock ? `${clock.slice(0, 10)} ${clock.slice(11, 16)}` : "--"}</span>
        <span className="font-mono text-[11px] text-muted-foreground hidden md:inline">· tick #{status?.tick_count ?? 0}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Select value={String(status?.speed ?? 1)} onValueChange={(v) => control({ speed: Number(v) })}>
          <SelectTrigger className="w-[84px] h-9 font-mono text-xs" data-testid="speed-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0.5, 1, 2, 5].map((s) => <SelectItem key={s} value={String(s)} data-testid={`speed-option-${s}`}>{s}x</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={inject} data-testid="inject-anomaly-btn" className="hidden md:inline-flex">
          <Zap className="h-4 w-4 mr-1.5 text-alert" /> Inject fault
        </Button>
        <Button size="sm" onClick={() => control({ paused: !paused })} data-testid="pause-resume-btn" className="min-w-[96px]">
          {paused ? <><Play className="h-4 w-4 mr-1.5" />Resume</> : <><Pause className="h-4 w-4 mr-1.5" />Pause</>}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} data-testid="theme-toggle-btn" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
