/**
 * Goals & Development — the person's goals with a status each. The person,
 * a lead of their team or management may add one or move its status; the
 * database enforces the same predicate it uses for the rest of their record.
 */
import { useState } from "react";
import { CheckCircle2, Circle, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { GOAL_STATUS_LABEL, useGoalActions, useMemberGoals, type GoalStatus } from "@/lib/data/member-goals";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const TONE: Record<GoalStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-800",
  on_track: "bg-emerald-500/10 text-emerald-800",
  completed: "bg-emerald-500/10 text-emerald-800",
};

export function GoalsCard({ userId, canEdit, limit, compact = false }: { userId: string; canEdit: boolean; limit?: number; compact?: boolean }) {
  const goals = useMemberGoals(userId);
  const actions = useGoalActions(userId);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const rows = (goals.data ?? []).slice(0, limit ?? 100);

  const add = () => {
    if (!title.trim()) return;
    actions.add.mutate({ title, dueOn: dueOn || null }, {
      onSuccess: () => { setTitle(""); setDueOn(""); setAdding(false); },
      onError: (e) => toast({ title: "Could not add the goal", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-xs text-muted-foreground">No goals recorded yet.</li>}
        {rows.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2">
              {g.status === "completed" || g.status === "on_track"
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" aria-hidden />
                : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0">
                <span className={cn("block truncate font-medium", g.status === "completed" ? "text-muted-foreground line-through" : "text-foreground")}>{g.title}</span>
                {!compact && g.dueOn && <span className="block text-[10px] text-muted-foreground">Due {formatDate(g.dueOn)}</span>}
              </span>
            </span>
            {canEdit ? (
              <OpsSelect aria-label={`Status of ${g.title}`} size="sm" value={g.status}
                onValueChange={(v) => actions.setStatus.mutate({ id: g.id, status: v as GoalStatus })}
                options={(Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]).map((k) => ({ value: k, label: GOAL_STATUS_LABEL[k] }))} />
            ) : (
              <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", TONE[g.status])}>{GOAL_STATUS_LABEL[g.status]}</span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (adding ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 p-2 text-xs">
          <label className="min-w-[12rem] flex-1 text-muted-foreground">Goal
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" maxLength={160} placeholder="e.g. Maintain 90%+ Quality" />
          </label>
          <label className="text-muted-foreground">Due
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="mt-0.5 h-8 w-36 text-xs" />
          </label>
          <Button size="sm" className="h-8 text-xs" onClick={add} disabled={!title.trim() || actions.add.isPending}>Add</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add goal
        </Button>
      ))}
      {!canEdit && rows.length === 0 && <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Target className="h-3 w-3" aria-hidden /> Goals are set by the person or their lead.</p>}
    </div>
  );
}
