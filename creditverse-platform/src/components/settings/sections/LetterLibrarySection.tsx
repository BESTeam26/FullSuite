/**
 * Letter Library — BES default templates plus the organization's own. A
 * template is markdown with {{placeholders}}; the builder fills them from
 * facts and refuses to invent. Deleting is deactivating. The organization
 * owns the wording of its own templates; the database's approval gate still
 * refuses prohibited phrases and mismatched citations on every letter.
 */
import { useMemo, useState } from "react";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { SectionCard } from "@/components/settings/shared";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import type { LetterAudience, LetterKind } from "@/lib/data/letters";
import { useLetterTemplates } from "@/lib/data/use-letters";
import { placeholdersIn, prohibitedPhrase } from "@/lib/dispute/letter-merge";
import { formatDate } from "@/lib/format-date";

const KINDS: { value: LetterKind; label: string }[] = [
  { value: "factual", label: "Factual dispute" }, { value: "integrity", label: "Internally inconsistent reporting" }, { value: "dofd", label: "Date of first delinquency" },
  { value: "mov", label: "Description of procedure" }, { value: "escalation", label: "Unresolved after reinvestigation" }, { value: "freeze", label: "Security freeze" },
  { value: "alternate_bureau", label: "Alternate bureau" }, { value: "other", label: "Other" },
];
const AUDIENCES: { value: LetterAudience; label: string }[] = [
  { value: "cra", label: "Consumer reporting agency" }, { value: "furnisher", label: "Furnisher" }, { value: "collector", label: "Debt collector" }, { value: "secondary_bureau", label: "Secondary bureau" }, { value: "cfpb", label: "CFPB" },
];
const input = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const label = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function LetterLibrarySection({ organizationId }: { organizationId: string }) {
  const auth = useAuth();
  const lib = useLetterTemplates();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "factual" as LetterKind, audience: "cra" as LetterAudience, name: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const bad = useMemo(() => prohibitedPhrase(f.body), [f.body]);
  const placeholders = useMemo(() => placeholdersIn(f.body), [f.body]);

  if (!lib.live) return <SectionCard icon={BookOpen} title="Letter Library" description="Templates read the live database."><p className="text-xs text-muted-foreground">Sign in to a live organization.</p></SectionCard>;

  const submit = () => {
    if (!auth.user || !f.name.trim() || f.body.trim().length < 40 || bad) return;
    setError(null);
    lib.create.mutate({ organizationId, kind: f.kind, audience: f.audience, name: f.name.trim(), body: f.body, placeholders, actorId: auth.user.id }, {
      onSuccess: () => { setOpen(false); setF({ kind: "factual", audience: "cra", name: "", body: "" }); },
      onError: (e) => setError(errorMessage(e, "Could not save the template.")),
    });
  };

  return (
    <SectionCard icon={BookOpen} title="Letter Library" description="BES default templates and your organization's own. Placeholders in {{double_braces}} are filled from the report and the consumer's attestation; nothing is guessed. Every letter still passes the approval gate."
      action={<Button size="sm" onClick={() => setOpen((v) => !v)}><Plus className="mr-1 h-4 w-4" /> New template</Button>}>
      {open && (
        <div className="mb-4 space-y-2 rounded-xl border border-border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block"><span className={label}>Name</span><input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} className={input} /></label>
            <label className="block"><span className={label}>Kind</span><OpsSelect value={f.kind} onValueChange={(v) => setF((x) => ({ ...x, kind: v as LetterKind }))} options={KINDS} aria-label="Kind" /></label>
            <label className="block"><span className={label}>Recipient</span><OpsSelect value={f.audience} onValueChange={(v) => setF((x) => ({ ...x, audience: v as LetterAudience }))} options={AUDIENCES} aria-label="Recipient" /></label>
          </div>
          <label className="block"><span className={label}>Body (use {"{{placeholder}}"} for facts: furnisher_name, account_masked, report_date, disputed_field, reported_value, evidence_description, evidence_date, correct_fact, consumer_name, consumer_address)</span>
            <textarea value={f.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} rows={10} className={`${input} font-mono`} /></label>
          <p className="text-[11px] text-muted-foreground">Placeholders found: {placeholders.length ? placeholders.join(", ") : "none"}.{bad && <span className="ml-1 text-status-danger">Contains a prohibited phrase: "{bad}".</span>}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={lib.create.isPending || !f.name.trim() || f.body.trim().length < 40 || !!bad}>{lib.create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save template"}</Button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
            {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
          </div>
        </div>
      )}
      {lib.isLoading && <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading templates…</p>}
      <ul className="divide-y divide-border/60">
        {lib.templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
            <div>
              <p className="font-semibold text-foreground">{t.name} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{t.organizationId ? "Yours" : "BES default"}</span></p>
              <p className="text-[11px] text-muted-foreground">{KINDS.find((k) => k.value === t.kind)?.label} · {AUDIENCES.find((a) => a.value === t.audience)?.label} · v{t.version} · {formatDate(t.createdAt)} · placeholders: {t.placeholders.join(", ") || "none"}</p>
            </div>
            {t.organizationId && (
              <button type="button" onClick={() => lib.deactivate.mutate(t.id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-status-danger"><Trash2 className="h-3.5 w-3.5" /> Deactivate</button>
            )}
          </li>
        ))}
      </ul>
      {lib.error && <p role="alert" className="text-xs text-status-danger">Could not load templates.</p>}
    </SectionCard>
  );
}
