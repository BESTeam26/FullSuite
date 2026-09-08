import {
  CreditCard,
  Gauge,
  Plug,
  MonitorSmartphone,
  Bell,
  Lock,
  ScrollText,
  SlidersHorizontal,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { SectionCard, Field, ToggleRow, PlaceholderNote } from "../shared";
import { useAuditLog } from "@/lib/data/use-audit";
import type { AuditRow } from "@/lib/data/audit";
import { formatDateTime } from "@/lib/format-date";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "@/lib/data/error-message";
import {
  STATE_LABEL,
  fetchIntegrationHealth,
  type IntegrationState,
} from "@/lib/data/integration-health";

/* ---------------- Plans & Billing ---------------- */
export const BillingSection = () => (
  <SectionCard
    icon={CreditCard}
    title="Plans & Billing Rules"
    description="Plans, base subscriptions, usage/metered pricing, DFY fulfillment rates, grace periods, failed-payment behavior, trials, and discounts."
  >
    <PlaceholderNote />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Grace period (days)">
        <Input placeholder="e.g. 7" disabled />
      </Field>
      <Field label="DFY fulfillment rate ($/client)">
        <Input placeholder="e.g. 49" disabled />
      </Field>
      <Field label="Pay-per-delete rate ($)">
        <Input placeholder="e.g. 35" disabled />
      </Field>
      <Field label="Per-active-client rate ($/mo)">
        <Input placeholder="e.g. 12" disabled />
      </Field>
    </div>
    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] text-foreground/80">
      Rule: Eligible active BES subscription + current billing → BES CRM
      included. Billing logic stays configurable, never hardcoded into pages.
    </div>
  </SectionCard>
);

/* ---------------- Usage & Metering ---------------- */
export const UsageSection = () => (
  <SectionCard
    icon={Gauge}
    title="Usage & Metering"
    description="Track pay-per-delete, per-active-client, and fulfillment fees across all Organizations."
  >
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { l: "Credit pulls (mo)", v: "1,284" },
        { l: "Letters mailed", v: "3,910" },
        { l: "SMS sent", v: "12,440" },
        { l: "AI tokens", v: "8.2M" },
        { l: "DFY hours", v: "412" },
        { l: "Active clients", v: "552" },
        { l: "Storage (GB)", v: "94" },
        { l: "PDF OCR pages", v: "2,108" },
      ].map((s) => (
        <div
          key={s.l}
          className="rounded-xl border border-border bg-muted/20 p-3"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {s.l}
          </p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{s.v}</p>
        </div>
      ))}
    </div>
  </SectionCard>
);

/* ---------------- Integrations ---------------- */
/**
 * Integrations — checked, not asserted.
 *
 * This panel used to list integrations from a hand-written array with invented
 * "last sync" times. It now asks each provider a read-only question with the
 * real credential and shows the answer, including the distinction that
 * actually bites: a Resend key can be perfectly valid while no sending domain
 * is verified, in which case mail still fails.
 *
 * Nothing here sends, posts, charges or spends. The check is manual because a
 * background poll would make provider calls nobody asked for.
 */
export const IntegrationsSection = () => {
  const health = useQuery({
    queryKey: ["integration-health"],
    queryFn: fetchIntegrationHealth,
    enabled: false,
    retry: false,
  });

  const TONE: Record<IntegrationState, string> = {
    working: "border-emerald-600/30 bg-emerald-500/10 text-status-success",
    rejected: "border-red-500/30 bg-red-500/10 text-status-danger",
    not_configured: "border-border bg-muted text-muted-foreground",
    unreachable: "border-amber-600/30 bg-amber-500/10 text-status-warning",
  };

  return (
    <SectionCard
      icon={Plug}
      title="Integrations"
      description="Every provider credential, tested against the provider. Secrets are never shown here or anywhere else."
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
          {health.isFetching ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          Check connections
        </Button>
        {health.data && (
          <span className="text-[11px] text-muted-foreground">
            Checked {formatDateTime(health.data.checkedAt)}
          </span>
        )}
      </div>

      {health.error && (
        <p role="alert" className="mb-3 text-xs text-status-danger">
          {errorMessage(health.error, "The check could not run.")}
        </p>
      )}

      {!health.data && !health.isFetching && !health.error && (
        <p className="text-xs text-muted-foreground">
          Nothing is checked until you ask. Press Check connections to test each provider with its real
          key — a read-only call that sends no email, posts no letter and charges nothing.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(health.data?.checks ?? []).map((c) => (
          <div key={c.provider} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{c.provider}</p>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[c.state]}`}>
                {STATE_LABEL[c.state]}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-foreground">{c.detail}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.powers}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Supabase Auth's own SMTP settings are not testable from here — they live in the Supabase
        dashboard, not in this app. The way to prove them is to request a password reset on your own
        account and see whether the mail arrives.
      </p>
    </SectionCard>
  );
};

/* ---------------- Portals ---------------- */
/**
 * Which outside-facing portals exist, and where each one is.
 *
 * This used to be five switches — Client, Referral Partner, Outsourcing,
 * Lender, DIY — three rendered on, one off, all with `onChange={() => {}}`.
 * There is no per-portal enable model anywhere in the schema, so the arrangement
 * was invented: it said the Outsourcing portal was switched ON when that portal
 * does not exist, and that the Lender portal was switched OFF as though somebody
 * had turned it off.
 *
 * A switch that cannot switch anything is worse than no control, so the
 * switches are gone. What replaces them is the fact: the route, and whether it
 * is open. A portal becomes a toggle here on the day there is something for the
 * toggle to write.
 */
const PORTALS: { name: string; route: string; live: boolean; note: string }[] = [
  {
    name: "Client portal",
    route: "/portal",
    live: true,
    note: "A credit client signs in and follows their own progress, letters and documents.",
  },
  {
    name: "Borrower portal",
    route: "/portal/funding",
    live: true,
    note: "A funding borrower opens their own file, offers and stipulations.",
  },
  {
    name: "Partner portal",
    route: "/partner",
    live: true,
    note: "A BES Partner contact sees their own partner and nothing else — the row is the boundary.",
  },
  {
    name: "Referral partner portal",
    route: "/affiliate",
    live: false,
    note: "Referrals sent and commission earned. Waiting on referral partners becoming people with logins.",
  },
  {
    name: "Outsourcing partner portal",
    route: "/outsourcing",
    live: false,
    note: "A partner-facing view of the work BES does for them. The work is in the platform; this view is not built.",
  },
  {
    name: "DIY consumer portal",
    route: "/diy",
    live: false,
    note: "Self-serve dispute work for a consumer. Not built.",
  },
];

export const PortalsSection = () => (
  <SectionCard
    icon={MonitorSmartphone}
    title="Portals"
    description="The outside-facing sign-ins. Each portal's contents are decided by row-level security, not by a setting here."
  >
    <ul className="space-y-2">
      {PORTALS.map((p) => (
        <li
          key={p.route}
          className="flex items-start justify-between gap-3 rounded-xl border border-border p-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{p.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.note}</p>
            <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {p.route}
            </code>
          </div>
          <Badge
            variant="outline"
            className={
              p.live
                ? "shrink-0 border-emerald-500/40 bg-emerald-500/10 text-status-success"
                : "shrink-0 border-border bg-card text-muted-foreground"
            }
          >
            {p.live ? "Open" : "Not built"}
          </Badge>
        </li>
      ))}
    </ul>
  </SectionCard>
);

/* ---------------- Notifications ---------------- */
/**
 * Notification delivery — shown as unavailable, not as settings.
 *
 * These controls looked live: three toggles rendered `checked` with
 * `onChange={() => {}}`, and four recipient fields with plausible addresses
 * that nothing read. There is no `notifications` table, no recipient model and
 * no delivery, so every one of them implied a preference that was never stored
 * and rules that never ran — the worst kind of settings screen, because an
 * operator would reasonably believe escalations were going to `admin@bes.io`.
 *
 * The fields stay visible so the shape of the eventual feature is legible, but
 * they are disabled and labelled. They become real controls when delivery does.
 */
export const NotificationsSection = () => (
  <SectionCard
    icon={Bell}
    title="Notifications"
    description="Delivery rules for in-app, email and SMS alerts, digests, and escalation recipients."
  >
    <div
      role="note"
      className="mb-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
    >
      <span className="font-semibold text-foreground">
        In-app only, and not configurable yet.
      </span>{" "}
      In-app notifications are delivered — assignments, handoffs, mentions,
      direct messages, announcements and anything needing attention route to
      your Notifications page. Email and SMS delivery, digests and per-person
      recipients are not built, so nothing on this screen is saved or sent.
    </div>

    <fieldset disabled className="opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="EOD digest recipients">
          <Input placeholder="e.g. ops@example.com" />
        </Field>
        <Field label="Escalation recipients">
          <Input placeholder="e.g. admin@example.com" />
        </Field>
        <Field label="Digest frequency">
          <Input placeholder="e.g. Daily 6:00 PM" />
        </Field>
        <Field label="Urgent alert channel">
          <Input placeholder="e.g. SMS + In-app" />
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        <ToggleRow
          label="In-app notifications"
          description="Delivered today: assignments, handoffs, mentions, direct messages, announcements, notes and anything moved into Attention route to your Notifications page. A per-user opt-out is not built."
          checked
          onChange={() => {}}
          state="enforced"
        />
        <ToggleRow
          label="Email notifications"
          checked={false}
          onChange={() => {}}
          state="unbuilt"
        />
        <ToggleRow
          label="SMS via connected system"
          checked={false}
          onChange={() => {}}
          state="unbuilt"
        />
      </div>
    </fieldset>
  </SectionCard>
);

/* ---------------- Security ---------------- */
export const SecuritySection = () => (
  <SectionCard
    icon={Lock}
    title="Security"
    description="Session policies, MFA, password rules, user suspension, allowed domains, sensitive-data policies, file-access rules, and API credentials. Fail closed when authorization context is missing."
  >
    <PlaceholderNote />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Session timeout (minutes)">
        <Input placeholder="e.g. 30" disabled />
      </Field>
      <Field label="Allowed email domains">
        <Input placeholder="e.g. bes.io" disabled />
      </Field>
    </div>
    <div className="mt-4 space-y-2">
      <ToggleRow
        label="Require MFA for all agency users"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Step-up auth for sensitive admin actions"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Restrict SSN/report exports (DLP)"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Fail closed on missing authorization context"
        description="Row Level Security denies by default on every table; there is no switch to turn that off."
        checked
        onChange={() => {}}
        state="enforced"
      />
    </div>
  </SectionCard>
);

/* ---------------- Audit Log ---------------- */
export const AuditSection = () => {
  const audit = useAuditLog(null, 200);
  const rows = audit.data ?? [];
  const summary = (a: AuditRow) => {
    const keys = new Set<string>([...Object.keys((a.before as Record<string, unknown> | null) ?? {}), ...Object.keys((a.after as Record<string, unknown> | null) ?? {})]);
    return [...keys].slice(0, 4).join(", ");
  };
  return (
    <SectionCard
      icon={ScrollText}
      title="Audit & Admin Activity"
      description="Every meaningful administrative mutation the database recorded — actor, record, previous and new value. Append-only; nothing here can be edited or deleted."
    >
      {audit.isLoading && <p className="text-xs text-muted-foreground">Loading the audit log…</p>}
      {audit.error && <p role="alert" className="text-xs text-status-danger">Could not load the audit log.</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Record</th>
              <th className="px-4 py-2.5 font-medium">Fields changed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!audit.isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No administrative events recorded yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground" title={a.createdAt}>{formatDateTime(a.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-foreground">{a.actor}</td>
                <td className="px-4 py-3">{a.action}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.entityType}{a.entityId ? <span className="ml-1 font-mono text-[10px]">{a.entityId.slice(0, 8)}</span> : null}</td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">{summary(a) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Times here are exact timestamps (audit view); the rest of the interface shows simple dates.</p>
    </SectionCard>
  );
};

/* ---------------- System & Feature Controls ---------------- */
export const SystemControlsSection = () => {
  const { featureFlags, toggleFlag } = useAgencySettings();
  const labels: Record<string, string> = {
    beta_score_simulator: "Beta: Score Simulator",
    beta_pdf_ocr: "Beta: PDF OCR Import",
    maintenance_mode: "Maintenance Mode",
    global_announcement: "Global Announcement Banner",
  };
  return (
    <SectionCard
      icon={SlidersHorizontal}
      title="System & Feature Controls"
      description="Platform Owner only: feature flags, beta features, maintenance mode, global announcement, and system health."
    >
      <div className="space-y-2">
        {Object.entries(featureFlags).map(([key, val]) => (
          <ToggleRow
            key={key}
            label={labels[key] ?? key}
            checked={val}
            onChange={() => toggleFlag(key)}
          />
        ))}
      </div>
    </SectionCard>
  );
};

/* ---------------- Danger Zone ---------------- */
export const DangerZoneSection = () => (
  <SectionCard
    icon={AlertTriangle}
    title="Danger Zone"
    description="Destructive actions require confirmation, reason, and audit history. Avoid hard-deletion of records with operational history."
  >
    <div className="space-y-3">
      {[
        "Suspend organization",
        "Archive organization",
        "Revoke user access",
        "Disconnect integration",
        "Reset configuration",
        "Delete test/demo data",
      ].map((d) => (
        <div
          key={d}
          className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 p-4"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{d}</p>
            <p className="text-[11px] text-muted-foreground">
              Requires confirmation + reason + audit event
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Not available yet — each action needs its confirmation flow, reason and audit event before it can run"
            className="border-red-500/40 text-status-danger hover:bg-red-500/10"
          >
            Execute
          </Button>
        </div>
      ))}
    </div>
  </SectionCard>
);
