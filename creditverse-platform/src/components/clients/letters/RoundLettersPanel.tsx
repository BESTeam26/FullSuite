/**
 * Round letters — the live Letter Builder (migration 0059). Facts first: a
 * template's placeholders are filled from the report item, the client and
 * what the operator types; nothing is invented. Then the round decision (keep
 * the counter or reset the cycle), the consumer's attestation (truth gate),
 * approval (the database's QA gate, explained here first) and mailing (which
 * starts the statutory timers). No "Anytime" letters — additional letters join
 * the running round.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import type { ClassifiedItem } from "@/lib/credit-classification";
import { errorMessage } from "@/lib/data/error-message";
import type { DisputeLetter, DisputeOrigin, DisputeStrategy, LetterAudience, LetterKind, LetterTemplate } from "@/lib/data/letters";
import { useClientLetters, useLetterTemplates } from "@/lib/data/use-letters";
import { approvalReadiness, mergeTemplate, placeholdersIn } from "@/lib/dispute/letter-merge";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { usePermission } from "@/lib/auth/use-permission";
import { AiWordingAssist } from "@/components/clients/letters/AiWordingAssist";

interface Props {
  clientId: string;
  clientName: string;
  items: ClassifiedItem[];
  /** Who prepared the dispute — decides which legal route the letter may take. */
  disputeOrigin: DisputeOrigin;
}

const KIND_LABEL: Record<LetterKind, string> = {
  factual: "Factual dispute", integrity: "Internally inconsistent reporting", dofd: "Date of first delinquency", mov: "Description of procedure (after results)",
  escalation: "Unresolved after reinvestigation", freeze: "Security freeze", alternate_bureau: "Alternate bureau", other: "Other",
};
const KIND_STRATEGY: Record<LetterKind, DisputeStrategy> = { factual: "factual", integrity: "integrity", dofd: "integrity", mov: "factual", escalation: "factual", freeze: "freeze", alternate_bureau: "secondary", other: "factual" };
const AUDIENCE_LABEL: Record<LetterAudience, string> = { cra: "Consumer reporting agency", furnisher: "Furnisher (creditor)", collector: "Debt collector", secondary_bureau: "Secondary bureau", cfpb: "CFPB" };
const CRA_NAMES: Record<string, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };
const STATUS_TONE: Record<DisputeLetter["status"], string> = {
  draft: "border-border bg-muted text-foreground", approved: "border-emerald-500/40 bg-emerald-500/10 text-status-success", printed: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  mailed: "border-blue-500/40 bg-blue-500/10 text-blue-800", responded: "border-purple-500/40 bg-purple-500/10 text-purple-800", closed: "border-border bg-muted text-muted-foreground",
};
const input = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const label = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function RoundLettersPanel({ clientId, clientName, items, disputeOrigin }: Props) {
  const auth = useAuth();
  const lib = useLetterTemplates();
  const rounds = useClientLetters(clientId);
  const canBuild = usePermission("creditops.letters.build").allowed;
  const [kind, setKind] = useState<LetterKind>("factual");
  const [templateId, setTemplateId] = useState<string>("");
  const [bureau, setBureau] = useState<string>("EQ");
  const [recipientName, setRecipientName] = useState("");
  const [itemId, setItemId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const templates = useMemo(() => lib.templates.filter((t) => t.kind === kind), [lib.templates, kind]);
  const template: LetterTemplate | null = templates.find((t) => t.id === templateId) ?? templates[0] ?? null;
  const item = items.find((i) => i.id === itemId) ?? null;
  const recipientKind: LetterAudience = template?.audience ?? "cra";
  const recipient = recipientKind === "cra" ? CRA_NAMES[bureau] : recipientName;

  /* Facts the platform holds fill their placeholders; everything else is asked for, never guessed. */
  const autoValues = useMemo<Record<string, string>>(() => ({
    consumer_name: clientName,
    furnisher_name: item?.name ?? "",
    account_masked: (item as (ClassifiedItem & { accountRef?: string }) | null)?.accountRef ?? "",
    status_reported: item?.status ?? "",
    dofd_reported: item?.dofd ?? "",
    registry_name: recipientKind === "secondary_bureau" ? recipientName : "",
    report_date: "",
  }), [clientName, item, recipientKind, recipientName]);
  const allValues = useMemo(() => ({ ...autoValues, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== "")) }), [autoValues, values]);
  const needed = template ? placeholdersIn(template.body).filter((p) => !(allValues[p] && allValues[p].trim())) : [];
  const merged = template ? mergeTemplate(template.body, allValues) : null;

  const build = async () => {
    if (!auth.user || !template || !merged || !merged.ok) return;
    setBusy(true); setError(null);
    try {
      const roundId = await rounds.openRoundMutation.mutateAsync({ strategy: KIND_STRATEGY[kind], resetCycle: rounds.openRound ? reset : true });
      await rounds.createDraft.mutateAsync({
        roundId, clientId, templateId: template.id, recipientKind, recipientName: recipient, bureau: recipientKind === "cra" ? bureau : null,
        itemIds: item ? [item.id] : [], findingIds: [], disputeOrigin, bodyFinal: merged.body, actorId: auth.user.id,
      });
      setValues({}); setReset(false);
    } catch (e) { setError(errorMessage(e, "Could not build the letter.")); }
    finally { setBusy(false); }
  };

  if (!rounds.live) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground"><FileText className="h-4 w-4 text-primary" /> Build round letters</h3>
          <p className="text-[11px] text-muted-foreground">
            {rounds.openRound ? `Round ${rounds.openRound.roundNumber} open since ${formatDate(rounds.openRound.openedAt)} · ${rounds.openRound.strategy}` : "No round open — the first build opens Round 1."}
          </p>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block"><span className={label}>Letter kind</span>
            <OpsSelect value={kind} onValueChange={(v) => { setKind(v as LetterKind); setTemplateId(""); }} options={(Object.keys(KIND_LABEL) as LetterKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} aria-label="Letter kind" /></label>
          <label className="block"><span className={label}>Template</span>
            <OpsSelect value={template?.id ?? ""} onValueChange={setTemplateId} options={templates.length ? templates.map((t) => ({ value: t.id, label: `${t.name}${t.organizationId ? "" : " · BES default"}` })) : [{ value: "", label: "No template of this kind" }]} disabled={templates.length === 0} aria-label="Template" /></label>
          <label className="block"><span className={label}>Recipient · {template ? AUDIENCE_LABEL[template.audience] : "—"}</span>
            {recipientKind === "cra" ? (
              <OpsSelect value={bureau} onValueChange={setBureau} options={Object.entries(CRA_NAMES).map(([k, v]) => ({ value: k, label: v }))} aria-label="Bureau" />
            ) : (
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={recipientKind === "secondary_bureau" ? "Registry name" : "Furnisher / collector name"} className={input} />
            )}
          </label>
          <label className="block"><span className={label}>Report item disputed</span>
            <OpsSelect value={itemId} onValueChange={setItemId} options={[{ value: "", label: "None (general letter)" }, ...items.map((i) => ({ value: i.id, label: `${i.name} · ${i.status}${i.balance ? ` · ${i.balance}` : ""}` }))]} aria-label="Report item" /></label>
        </div>

        {template && needed.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Facts the letter still needs — typed by a person, never guessed:</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {needed.map((p) => (
                <label key={p} className="block"><span className={label}>{p.replace(/_/g, " ")}</span>
                  <input value={values[p] ?? ""} onChange={(e) => setValues((x) => ({ ...x, [p]: e.target.value }))} className={input} /></label>
              ))}
            </div>
          </div>
        )}

        {merged && merged.ok && (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">{merged.body}</pre>
        )}

        {rounds.openRound && (
          <fieldset className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
            <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">Round {rounds.openRound.roundNumber} is open — this build:</legend>
            <label className="flex items-start gap-2"><input type="radio" name="round" checked={!reset} onChange={() => setReset(false)} className="mt-0.5" /> <span><span className="font-semibold">Keeps round {rounds.openRound.roundNumber}</span> — these are additional letters in the current cycle.</span></label>
            <label className="mt-1.5 flex items-start gap-2"><input type="radio" name="round" checked={reset} onChange={() => setReset(true)} className="mt-0.5" /> <span><span className="font-semibold">Resets the cycle</span> — closes round {rounds.openRound.roundNumber} and opens round {rounds.openRound.roundNumber + 1}.</span></label>
          </fieldset>
        )}

        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={() => void build()} disabled={!canBuild || busy || !template || !merged?.ok || !auth.user || (recipientKind !== "cra" && !recipientName.trim())} title={canBuild ? undefined : "Your role does not include building letters"}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />} Create draft letter
          </Button>
          {template && merged && !merged.ok && <p className="text-[11px] text-muted-foreground">Fill the facts above to preview the letter.</p>}
          {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Letters · {rounds.letters.length}</h3>
        {rounds.isLoading && <p className="mt-2 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…</p>}
        {!rounds.isLoading && rounds.letters.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No letters yet.</p>}
        <ul className="mt-2 space-y-2">
          {rounds.letters.map((l) => <LetterRow key={l.id} letter={l} rounds={rounds} roundNumber={rounds.rounds.find((r) => r.id === l.roundId)?.roundNumber} actorId={auth.user?.id ?? null} />)}
        </ul>
      </section>
    </div>
  );
}

function LetterRow({ letter, rounds, roundNumber, actorId }: { letter: DisputeLetter; rounds: ReturnType<typeof useClientLetters>; roundNumber?: number; actorId: string | null }) {
  const canApprove = usePermission("creditops.letters.approve").allowed;
  const canBuild = usePermission("creditops.letters.build").allowed;
  const [open, setOpen] = useState(false);
  const [attest, setAttest] = useState({ recognises: "yes" as "yes" | "no" | "unsure", disputed: "", reason: "", documents: "", certification: "" });
  const [error, setError] = useState<string | null>(null);
  const readiness = approvalReadiness({ body: letter.bodyFinal, recipient: letter.recipientKind, origin: letter.disputeOrigin, attested: letter.attested });
  const run = async (fn: () => Promise<unknown>, fallback: string) => { setError(null); try { await fn(); } catch (e) { setError(errorMessage(e, fallback)); } };

  return (
    <li className="rounded-lg border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{letter.recipientName}{roundNumber && <span className="text-muted-foreground"> · round {roundNumber}</span>}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(letter.createdAt)} · {letter.disputeOrigin.replace(/_/g, " ")}{letter.mailedAt && ` · mailed ${formatDate(letter.mailedAt)}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize", STATUS_TONE[letter.status])}>{letter.status}</span>
          {letter.attested && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-status-success"><ShieldCheck className="h-3 w-3" /> attested</span>}
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-primary hover:underline">{open ? "Hide" : "Open"}</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">{letter.bodyFinal}</pre>
          {letter.status === "draft" && actorId && canBuild && (
            <AiWordingAssist body={letter.bodyFinal} disabled={rounds.updateBody.isPending} onApply={(next) => void run(() => rounds.updateBody.mutateAsync({ letterId: letter.id, body: next }), "Could not update the letter.")} />
          )}
          {letter.status === "draft" && !letter.attested && actorId && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Consumer attestation (truth gate)</p>
              <p className="mt-1 text-[11px] text-muted-foreground">In the consumer's own words. Nothing is sent without it.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block"><span className={label}>Do you recognise this account?</span>
                  <OpsSelect value={attest.recognises} onValueChange={(v) => setAttest((a) => ({ ...a, recognises: v as "yes" | "no" | "unsure" }))} options={[{ value: "yes", label: "Yes, I recognise it" }, { value: "no", label: "No, I do not recognise it" }, { value: "unsure", label: "I am not sure" }]} aria-label="Recognises account" /></label>
                <label className="block"><span className={label}>Supporting documents (comma-separated)</span><input value={attest.documents} onChange={(e) => setAttest((a) => ({ ...a, documents: e.target.value }))} className={input} /></label>
                <label className="block sm:col-span-2"><span className={label}>The specific information I believe is inaccurate</span><input value={attest.disputed} onChange={(e) => setAttest((a) => ({ ...a, disputed: e.target.value }))} className={input} /></label>
                <label className="block sm:col-span-2"><span className={label}>My reason</span><input value={attest.reason} onChange={(e) => setAttest((a) => ({ ...a, reason: e.target.value }))} className={input} /></label>
                {attest.recognises === "no" && (
                  <label className="block sm:col-span-2"><span className={label}>Identity-theft certification (required when the account is not yours)</span>
                    <input value={attest.certification} onChange={(e) => setAttest((a) => ({ ...a, certification: e.target.value }))} placeholder="I certify that I did not open, authorise, use or receive the goods, services or money from this account." className={input} /></label>
                )}
              </div>
              <Button size="sm" className="mt-2" disabled={!attest.disputed.trim() || !attest.reason.trim() || (attest.recognises === "no" && !attest.certification.trim())}
                onClick={() => void run(() => rounds.attest.mutateAsync([letter.id, { recognises_account: attest.recognises, disputed_information: attest.disputed.trim(), reason: attest.reason.trim(), documents: attest.documents.split(",").map((s) => s.trim()).filter(Boolean), ...(attest.recognises === "no" ? { identity_theft_certification: attest.certification.trim() } : {}) }, actorId]), "Could not record the attestation.")}>
                <ShieldCheck className="mr-1 h-4 w-4" /> Record attestation
              </Button>
            </div>
          )}
          {letter.status === "draft" && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Approval check</p>
              {readiness.ready ? <p className="mt-1 text-xs text-status-success">Ready: attested, complete, citations fit the recipient, no prohibited phrases.</p> : (
                <ul className="mt-1 list-disc pl-4 text-xs text-foreground">{readiness.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              )}
              <Button size="sm" className="mt-2" disabled={!readiness.ready || !canApprove} title={canApprove ? undefined : "Your role does not include approving letters"} onClick={() => void run(() => rounds.approve.mutateAsync(letter.id), "The database refused approval.")}><CheckCircle2 className="mr-1 h-4 w-4" /> Approve</Button>{!canApprove && <p className="mt-1 text-[10px] text-muted-foreground">Approval needs the "Approve dispute letters" permission — a QA reviewer or an admin.</p>}
            </div>
          )}
          {(letter.status === "approved" || letter.status === "printed") && (
            <Button size="sm" variant="outline" disabled={!canBuild} onClick={() => void run(() => rounds.markMailed.mutateAsync(letter.id), "Could not mark the letter mailed.")}><Mail className="mr-1 h-4 w-4" /> Mark mailed today</Button>
          )}
          {letter.timers.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statutory clocks (data, not deadlines the code enforces)</p>
              <ul className="mt-1 space-y-0.5">
                {letter.timers.map((t) => <li key={t.kind} className="text-[11px] text-foreground">{t.kind.replace(/_/g, " ")} · due {formatDate(t.dueAt)}{t.satisfiedAt && ` · satisfied ${formatDate(t.satisfiedAt)}`}{t.note && <span className="text-muted-foreground"> — {t.note}</span>}</li>)}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
        </div>
      )}
    </li>
  );
}
