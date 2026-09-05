/**
 * Lenders — the Lender Network Intelligence surface of the FundingOps engine
 * (Dee's FundingOS design), first slice: capital provider directory,
 * programs, policy versions with source and verification, "Verify again".
 * Relationship intelligence (contacts, partner status), the policy-update
 * feed with deterministic file impact, and the observed-outcome scorecard. Nothing here ranks lenders.
 */
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { Landmark, Loader2, Search } from "lucide-react";
import { LenderCatalogueEditor } from "@/components/dashboard/fulfillment/funding-domain/LenderCatalogueEditor";
import { LenderRelationshipPanel } from "@/components/dashboard/fulfillment/funding-domain/LenderRelationshipPanel";
import { LenderScorecard } from "@/components/dashboard/fulfillment/funding-domain/LenderScorecard";
import { PolicyUpdateFeed } from "@/components/dashboard/fulfillment/funding-domain/PolicyUpdateFeed";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useLenderCatalogue } from "@/lib/data/use-funding-domain";
import { useFundingOpsAccess } from "@/lib/fulfillment/fundingops-access";
import { effectivePolicy, type CatalogueLender } from "@/lib/funding/lender-catalogue";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = { bank: "Bank", credit_union: "Credit union", nonbank_lender: "Non-bank lender", funder: "Funder", network: "Network", cdc: "CDC" };

export default function Lenders() {
  const auth = useAuth();
  const agency = useAgency();
  const access = useFundingOpsAccess();
  const live = auth.mode === "live";
  const catalogue = useLenderCatalogue(live);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"directory" | "scorecard">("directory");
  const canEdit = live && access.canEditStageProgress;
  const today = new Date().toISOString().slice(0, 10);

  const lenders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalogue.data ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || l.programs.some((p) => p.productFamily.toLowerCase().includes(q)));
  }, [catalogue.data, query]);
  const selected = lenders.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Landmark className="h-5 w-5 text-primary" /> Lenders</h1>
        <p className="text-sm text-muted-foreground">
          Capital providers, their programs and the policy version in force — each with its source and when a person last confirmed it — and the scorecard of what actually happened when files were submitted. Data confidence, never a score; descriptive outcomes, never a prediction; operational order, never a ranking.
        </p>
      </div>

      {!live && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">The lender catalogue reads the live database. Demo mode shows nothing here.</p>}

      {live && (
        <div role="tablist" aria-label="Lenders view" className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5 text-xs font-semibold">
          {(["directory", "scorecard"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
              className={cn("rounded-md px-3 py-1.5 transition-colors", tab === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {v === "directory" ? "Directory & policies" : "Scorecard"}
            </button>
          ))}
        </div>
      )}

      {live && <PolicyUpdateFeed canAcknowledge={canEdit} />}

      {live && tab === "scorecard" && <LenderScorecard />}

      {live && tab === "directory" && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search providers by name or product family"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm">
              {catalogue.isLoading && <p className="inline-flex items-center gap-1 p-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading catalogue…</p>}
              {!catalogue.isLoading && lenders.length === 0 && <p className="p-4 text-xs text-muted-foreground">No capital providers yet. Add the ones BES actually works with — each program's criteria need a source and a verification date before Program Fit will use them.</p>}
              <ul className="divide-y divide-border/60">
                {lenders.map((l) => <LenderRow key={l.id} lender={l} today={today} selected={l.id === selectedId} onSelect={() => setSelectedId(l.id)} />)}
              </ul>
            </div>
            {canEdit && auth.user && agency.activeOrganization && (
              <LenderCatalogueEditor.AddLender organizationId={agency.activeOrganization.id} actorId={auth.user.id} />
            )}
          </div>

          <div className="space-y-3">
            {!selected && <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Select a capital provider to see its programs, policy versions and data confidence.</div>}
            {selected && <LenderDetail lender={selected} today={today} canEdit={canEdit} actorId={auth.user?.id ?? null} />}
          </div>
        </div>
      )}
    </div>
  );
}

function LenderRow({ lender, today, selected, onSelect }: { lender: CatalogueLender; today: string; selected: boolean; onSelect: () => void }) {
  const inForce = lender.programs.filter((p) => p.active && effectivePolicy(p, today)).length;
  return (
    <li>
      <button type="button" onClick={onSelect} className={cn("flex w-full items-start justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary", selected && "bg-primary/5")}>
        <div>
          <p className="text-sm font-semibold text-foreground">{lender.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {KIND_LABEL[lender.lenderKind] ?? lender.lenderKind} · {lender.organizationId ? "your catalogue" : "BES catalogue"} · {lender.programs.length} program{lender.programs.length === 1 ? "" : "s"} · {inForce} with a policy in force
          </p>
        </div>
        {!lender.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Inactive</span>}
      </button>
    </li>
  );
}

function LenderDetail({ lender, today, canEdit, actorId }: { lender: CatalogueLender; today: string; canEdit: boolean; actorId: string | null }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-bold text-foreground">{lender.name}</h2>
        <p className="text-[11px] text-muted-foreground">{KIND_LABEL[lender.lenderKind] ?? lender.lenderKind}</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Confidence label="Identity" value={lender.programs.length >= 0 ? "Registry identifiers recorded by an operator; registry check not yet automated." : ""} />
          <Confidence label="Programs" value={`${lender.programs.length} recorded · ${lender.programs.filter((p) => effectivePolicy(p, today)).length} with a policy in force today`} />
          <Confidence label="Criteria" value={verificationSummary(lender, today)} />
          <Confidence label="Outcome evidence" value="Descriptive rollups arrive with submissions history; never predictive." />
        </dl>
      </div>

      <LenderRelationshipPanel lenderId={lender.id} canEdit={canEdit} actorId={actorId} />

      {lender.programs.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No programs yet.</p>}
      {lender.programs.map((p) => {
        const current = effectivePolicy(p, today);
        const versions = [...p.policyVersions].sort((a, b) => b.version - a.version);
        return (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">{p.productFamily}{p.productSubtype && ` · ${p.productSubtype}`}{p.statesAllowed.length > 0 && ` · ${p.statesAllowed.join(", ")}`}{!p.active && " · inactive"}</p>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", current ? "border-emerald-500/40 bg-emerald-500/10 text-status-success" : "border-amber-500/40 bg-amber-500/10 text-amber-800")}>
                {current ? `Policy v${current.version} in force` : "Policy Unavailable"}
              </span>
            </div>
            {versions.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No policy version recorded. Program Fit cannot use this program until one exists with a source and a verification.</p> : (
              <ul className="mt-2 space-y-1.5">
                {versions.map((v) => (
                  <li key={v.version} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">v{v.version} · effective {formatDate(v.effectiveFrom)}{v.effectiveUntil ? ` → ${formatDate(v.effectiveUntil)}` : ""}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {v.sourceType.replace(/_/g, " ")}{v.sourceReference && ` · ${v.sourceReference}`}{v.sourcePublishedDate && ` · published ${formatDate(v.sourcePublishedDate)}`} · {v.lastVerifiedAt ? `verified ${formatDate(v.lastVerifiedAt)}` : "never verified"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{summariseCriteria(v.criteria)}</p>
                    {canEdit && actorId && current?.version === v.version && (
                      <LenderCatalogueEditor.VerifyAgain programId={p.id} version={v.version} actorId={actorId} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && actorId && <LenderCatalogueEditor.AddPolicyVersion programId={p.id} nextVersion={(versions[0]?.version ?? 0) + 1} actorId={actorId} />}
          </div>
        );
      })}
      {canEdit && <LenderCatalogueEditor.AddProgram lenderId={lender.id} />}
    </div>
  );
}

function Confidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function verificationSummary(lender: CatalogueLender, today: string): string {
  const stamps = lender.programs.map((p) => effectivePolicy(p, today)?.lastVerifiedAt ?? null).filter((s): s is string => !!s);
  if (stamps.length === 0) return "No policy in force has been verified with the lender.";
  const newest = stamps.sort().at(-1)!;
  const days = Math.floor((Date.now() - new Date(newest).getTime()) / 86_400_000);
  return `Lender-stated criteria, last verified ${days} day${days === 1 ? "" : "s"} ago.`;
}

function summariseCriteria(c: Record<string, unknown>): string {
  const parts: string[] = [];
  const num = (k: string, label: string, fmt: (n: number) => string) => { const v = c[k]; const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; if (Number.isFinite(n)) parts.push(`${label} ${fmt(n)}`); };
  num("min_amount", "amount ≥", (n) => `$${n.toLocaleString()}`);
  num("max_amount", "amount ≤", (n) => `$${n.toLocaleString()}`);
  num("min_credit_score", "credit ≥", (n) => String(n));
  num("min_time_in_business_months", "time in business ≥", (n) => `${n} mo`);
  num("min_monthly_revenue", "monthly revenue ≥", (n) => `$${n.toLocaleString()}`);
  if (Array.isArray(c.industries_excluded) && c.industries_excluded.length) parts.push(`excludes ${(c.industries_excluded as string[]).join(", ")}`);
  if (c.strength && typeof c.strength === "object") parts.push(`strength: ${Object.entries(c.strength as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return parts.length ? parts.join(" · ") : "no criteria recorded";
}
