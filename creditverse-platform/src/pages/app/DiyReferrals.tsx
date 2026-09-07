/**
 * DIY Referrals — the consumers this organization sent to BES DIY Credit, and
 * what that has earned.
 *
 * Two rules shape this screen, both of them Dee's:
 *
 *   SCOPE-LOCKED. An organization sees its own referrals and nobody else's.
 *   Consumers who came to BES directly are never assigned to anyone, so they
 *   simply do not appear.
 *
 *   ATTRIBUTION IS NOT ACCESS. Being owed money for a consumer says nothing
 *   about their credit report, their disputes or their documents. This page
 *   shows who was referred, what they did, and what it earned — and there is
 *   no path from here to anything else, because the database has none.
 *
 * Every figure is a count or a sum of rows on this page. There is no metric
 * here that is not derived from something visible.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Link2, Check, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useAgency } from "@/lib/agency-context";
import {
  REFERRAL_PLAN_LABEL,
  fetchReferralCode,
  fetchReferralPlans,
  fetchReferrals,
  referralTotals,
  setReferralCode,
} from "@/lib/data/referrals";

const money = (n: number) => `$${n.toFixed(2)}`;

const Tile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

export default function DiyReferrals() {
  const { activeOrganization } = useAgency();
  const orgId = activeOrganization?.id ?? null;
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["referrals", "list", orgId],
    queryFn: () => fetchReferrals(orgId as string),
    enabled: !!orgId,
    staleTime: 30_000,
  });
  const code = useQuery({
    queryKey: ["referrals", "code", orgId],
    queryFn: () => fetchReferralCode(orgId as string),
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const plans = useQuery({
    queryKey: ["referrals", "plans", orgId],
    queryFn: () => fetchReferralPlans(orgId as string),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: () => setReferralCode(orgId as string, draft.trim()),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (e) => setError(errorMessage(e, "That code could not be set.")),
  });

  /* Memoised together: `rows.data ?? []` is a new array on every render, so
     deriving the totals from it directly would recompute them every time. */
  const list = useMemo(() => rows.data ?? [], [rows.data]);
  const totals = useMemo(() => referralTotals(list), [list]);
  const link = code.data ? `${window.location.origin}/diy?ref=${code.data.code}` : null;

  if (!orgId) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-sm text-muted-foreground">
          Referrals belong to an organization. Switch into one to see its programme.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Gift className="h-6 w-6 text-primary" /> DIY Referrals
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Consumers {activeOrganization?.name ?? "this organization"} sent to BES DIY Credit, and what
            each has earned. You see your own referrals only — consumers who came to BES directly are
            never assigned to anyone.
          </p>
        </div>
        <DataSourceBadge source="live" />
      </div>

      {/* ── The link ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Link2 className="h-4 w-4 text-primary" /> Your referral link
        </h2>
        {code.isLoading ? (
          <div className="mt-3 h-9 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : link ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
              {link}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Code {code.data?.code} · consumers who sign up through it are attributed to you
            </span>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Choose a code
              </span>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="SUMMIT"
                className="w-48"
                aria-label="Referral code"
              />
            </label>
            <Button type="button" size="sm" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Create the link
            </Button>
            <span className="text-[11px] text-muted-foreground">3–32 letters, digits, dashes or underscores.</span>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-status-danger">
            {error}
          </p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Link clicks are not counted yet — that needs a public endpoint recording them, which is a
          separate piece of work. Everything below is counted from real records.
        </p>
      </div>

      {/* ── What it has produced ─────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Referred" value={String(totals.referred)} hint="consumers attributed to you" />
        <Tile label="Signed up" value={String(totals.signedUp)} />
        <Tile label="Paying" value={String(totals.subscribed)} />
        <Tile
          label="Converted"
          value={String(totals.convertedCredit + totals.convertedFunding)}
          hint={`${totals.convertedCredit} credit · ${totals.convertedFunding} funding`}
        />
        <Tile label="Earned" value={money(totals.earned)} hint="all states except reversed" />
        <Tile label="Paid" value={money(totals.paid)} />
        <Tile label="Outstanding" value={money(totals.outstanding)} hint="earned but not yet paid" />
      </div>

      {/* ── The referrals ────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-3.5 text-sm font-bold text-foreground">Your referrals</h2>
        {rows.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : rows.error ? (
          <p className="p-5 text-sm text-status-danger">Could not load: {(rows.error as Error).message}</p>
        ) : list.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Nobody yet. A consumer appears here when they sign up through your link.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Consumer</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">DIY status</th>
                <th className="px-4 py-2.5">Referred</th>
                <th className="px-4 py-2.5">What they did</th>
                <th className="px-4 py-2.5">Earned</th>
                <th className="px-4 py-2.5">Paid</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.attributionId} className="border-t border-border/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.consumerName ?? "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{r.consumerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.source}</td>
                  <td className="px-4 py-3 text-foreground">{r.diyStage ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.attributedAt)}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {r.signedUp && <Pill>Signed up</Pill>}
                      {r.subscribed && <Pill tone="ok">Paying</Pill>}
                      {r.convertedCredit && <Pill tone="ok">Credit</Pill>}
                      {r.convertedFunding && <Pill tone="ok">Funding</Pill>}
                      {!r.signedUp && !r.subscribed && !r.convertedCredit && !r.convertedFunding && (
                        <span className="text-xs text-muted-foreground">Nothing yet</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{money(r.commissionEarned)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{money(r.commissionPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── The rules that price it ──────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">Commission rules</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Rows, not constants. Every amount above was computed by the database from the rule in force on
          the day, and the figure a percentage was taken from is kept so a payout can be checked.
        </p>
        {(plans.data ?? []).length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No referral rules configured yet, so nothing is owed on a referral. A missing rule never
            invents a rate — the event is still recorded.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {(plans.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium text-foreground">{p.label}</span>
                <span className="text-xs text-muted-foreground">
                  {REFERRAL_PLAN_LABEL[p.appliesTo] ?? p.appliesTo} ·{" "}
                  {p.basis === "flat" ? money(p.rateOrAmount) : `${p.rateOrAmount}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Being attributed a consumer does not give access to their account. Credit reports, evidence,
        documents and disputes stay behind their own permissions, and attribution survives the consumer
        later buying another service.
      </p>
    </div>
  );
}

const Pill = ({ children, tone }: { children: React.ReactNode; tone?: "ok" }) => (
  <span
    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
      tone === "ok"
        ? "border-emerald-600/30 bg-emerald-500/10 text-status-success"
        : "border-border bg-muted text-foreground"
    }`}
  >
    {children}
  </span>
);
