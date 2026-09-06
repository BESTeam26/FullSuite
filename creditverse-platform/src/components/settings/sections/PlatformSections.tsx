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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { SectionCard, Field, ToggleRow, StatusBadge, PlaceholderNote } from "../shared";

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
export const IntegrationsSection = () => {
  const { integrations } = useAgencySettings();
  return (
    <SectionCard
      icon={Plug}
      title="Integrations"
      description="Central integration center. Secrets are never exposed on settings screens."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {integrations.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between rounded-xl border border-border p-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{i.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {i.category} · Last sync {i.lastSync}
              </p>
            </div>
            <StatusBadge state={i.status} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

/* ---------------- Portals ---------------- */
export const PortalsSection = () => (
  <SectionCard
    icon={MonitorSmartphone}
    title="Portals"
    description="Client, Referral Partner, Outsourcing, Lender, and DIY portals. Control enabled modules, default visibility, branding, and shared fields."
  >
    <div className="space-y-2">
      {[
        { p: "Client Portal", on: true },
        { p: "Referral Partner Portal", on: true },
        { p: "Outsourcing Portal", on: true },
        { p: "Lender Portal", on: false },
        { p: "DIY Consumer Portal", on: true },
      ].map((p) => (
        <ToggleRow key={p.p} label={p.p} checked={p.on} onChange={() => {}} />
      ))}
    </div>
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
        Not active yet.
      </span>{" "}
      Notification delivery has not been built, so nothing here is saved or
      sent. These fields show what will be configurable.
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
          description="Delivered today: assignments, notes and status changes route to your Notifications page. A per-user opt-out is not built."
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
  const { audit } = useAgencySettings();
  const sevTone: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    warning: "bg-amber-500/10 text-status-warning border-amber-500/30",
    critical: "bg-red-500/10 text-red-700 border-red-500/30",
  };
  return (
    <SectionCard
      icon={ScrollText}
      title="Audit & Admin Activity"
      description="Meaningful administrative events only — not every page view or UI click."
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Target</th>
              <th className="px-4 py-2.5 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {audit.map((a) => (
              <tr key={a.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-[11px] text-muted-foreground">
                  {a.at}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {a.actor}
                </td>
                <td className="px-4 py-3">{a.action}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.target}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${sevTone[a.severity]}`}
                  >
                    {a.severity}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
