import { CheckCircle2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/common";

export function JobsList({ jobs, onComplete }) {
  return (
    <Panel title="Cleaning jobs" sub="Scheduled crew visits" testid="jobs-list">
      {!jobs.length ? (
        <div className="text-sm text-muted-foreground">No cleaning jobs scheduled yet.</div>
      ) : (
        <ul className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border p-3.5" data-testid={`job-${j.id}`}>
              <div className="flex items-center gap-2">
                {j.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-energy" /> : <Wrench className="h-4 w-4 text-solar" />}
                <span className="font-mono font-bold text-sm">{j.date}</span>
                <span className={`ml-auto text-[10px] font-bold uppercase rounded px-2 py-0.5 ${j.status === "completed" ? "bg-energy/15 text-energy" : "bg-solar/15 text-solar"}`}>{j.status}</span>
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">{j.panel_ids.join(", ")}</div>
              {j.status !== "completed" && (
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onComplete(j.id)} data-testid={`complete-job-${j.id}`}>Mark complete · clean panels</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
