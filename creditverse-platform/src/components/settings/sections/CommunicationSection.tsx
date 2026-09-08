/**
 * Agency Settings → Communication.
 *
 * The Professional Messaging Guard, and the words it refuses.
 *
 * Dee, §36, is the whole design brief and it is worth restating on the screen
 * itself, because a moderation control with no stated scope is one people
 * quietly work around: this blocks abuse, not directness. "This work is
 * overdue" sends. It is written on the panel so nobody has to guess.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addBlockedTerm, fetchCommunicationSettings, removeBlockedTerm, setGuardEnabled,
} from "@/lib/data/communication-settings";

export function CommunicationSection() {
  const auth = useAuth();
  const qc = useQueryClient();
  const agencyId = auth.agencyId ?? "";
  const canManage = auth.isAgencyAdmin;

  const settings = useQuery({
    queryKey: ["communication-settings", agencyId],
    queryFn: () => fetchCommunicationSettings(agencyId),
    enabled: !!agencyId,
    staleTime: 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["communication-settings", agencyId] });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setGuardEnabled(agencyId, enabled),
    onSuccess: refresh,
  });
  const add = useMutation({
    mutationFn: (v: { term: string; kind: "word" | "phrase" }) =>
      addBlockedTerm({ agencyId, ...v }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: removeBlockedTerm, onSuccess: refresh });

  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<"word" | "phrase">("word");

  if (!agencyId) return null;
  if (settings.isLoading) {
    return <p className="p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>;
  }

  const data = settings.data;
  const own = (data?.terms ?? []).filter((t) => !t.builtIn);
  const builtIn = (data?.terms ?? []).filter((t) => t.builtIn);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <header>
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Professional Messaging Guard
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Refuses obviously abusive messages sent by BES staff through Communication. It matches
          words and phrases, not tone — <em>“This process failed and needs correcting today”</em> sends
          normally. Messages coming in from partners and organizations are never blocked.
        </p>
      </header>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {data?.guardEnabled ? "On" : "Off"}
          </p>
          <p className="text-xs text-muted-foreground">
            {canManage
              ? "Only an owner or administrator can change this."
              : "Only an owner or administrator can change this. You are seeing the policy that applies to you."}
          </p>
        </div>
        <Switch
          checked={!!data?.guardEnabled}
          disabled={!canManage || toggle.isPending}
          aria-label="Professional Messaging Guard"
          onCheckedChange={(v) => toggle.mutate(v)}
        />
      </div>

      {toggle.isError && (
        <p role="alert" className="text-xs text-status-danger">{(toggle.error as Error).message}</p>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Your agency's blocked words and phrases
        </p>
        {own.length === 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            None yet. The built-in list below applies on its own.
          </p>
        ) : (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {own.map((t) => (
              <li key={t.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground">
                {t.term}
                <span className="text-[10px] text-muted-foreground">{t.kind}</span>
                {canManage && (
                  <button type="button" aria-label={`Remove ${t.term}`}
                    onClick={() => remove.mutate(t.id)}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            <Input className="h-8 w-48" value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder="Word or phrase" aria-label="Blocked word or phrase" />
            <OpsSelect size="sm" value={kind} onValueChange={(v) => setKind(v as "word" | "phrase")}
              aria-label="Match as"
              options={[
                { value: "word", label: "Whole word" },
                { value: "phrase", label: "Anywhere in the message" },
              ]} />
            <Button size="sm" variant="outline" disabled={!term.trim() || add.isPending}
              onClick={() => { add.mutate({ term, kind }); setTerm(""); }}>
              {add.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        )}
        {add.isError && (
          <p role="alert" className="mt-1 text-xs text-status-danger">{(add.error as Error).message}</p>
        )}
      </div>

      <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-foreground">
          Built-in list ({builtIn.length})
        </summary>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          These apply to every agency and cannot be edited here. The list deliberately does not
          include slurs — which terms BES blocks is a policy decision for you to make, and adding
          them above works exactly the same way.
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {builtIn.map((t) => (
            <li key={t.id}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t.term}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
