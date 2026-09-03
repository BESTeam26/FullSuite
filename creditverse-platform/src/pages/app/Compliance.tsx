import {
  Scale,
  Lock,
  AlertTriangle,
  ShieldCheck,
  FileText,
  MapPin,
  Sparkles,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const billingEvents = [
  {
    client: "Maria Gonzalez",
    service: "3 issues resolved",
    channel: "Web",
    state: "TX",
    rule: "CROA — no advance fee",
    eligible: true,
  },
  {
    client: "Devon Park",
    service: "1 issue resolved",
    channel: "Telemarketing",
    state: "CA",
    rule: "TSR — 6-month hold + docs",
    eligible: false,
  },
  {
    client: "Lena Ortiz",
    service: "5 issues resolved",
    channel: "Web",
    state: "FL",
    rule: "CROA — no advance fee",
    eligible: true,
  },
  {
    client: "James Whitaker",
    service: "2 issues resolved",
    channel: "Referral",
    state: "WA",
    rule: "CROA — no advance fee",
    eligible: true,
  },
];

const registrations = [
  { state: "Texas", code: "TX", status: "Registered", expires: "03/2027" },
  { state: "California", code: "CA", status: "Registered", expires: "11/2026" },
  { state: "Washington", code: "WA", status: "Registered", expires: "07/2027" },
  { state: "Florida", code: "FL", status: "Exempt", expires: "—" },
  { state: "New York", code: "NY", status: "Pending", expires: "—" },
];

const linterFlags = [
  { text: "Guaranteed deletion", severity: "Block" },
  { text: "Raise your score 100 points", severity: "Block" },
  { text: "Metro2 violation = automatic removal", severity: "Block" },
  { text: "We delete negative items", severity: "Review" },
];

const eligibilityChecks = [
  { label: "State", value: "California", ok: true },
  { label: "Acquisition channel", value: "Telemarketing", ok: true },
  { label: "Service classification", value: "Credit repair service", ok: true },
  { label: "Contract signed", value: "Complete", ok: true },
  { label: "Cancellation period", value: "Complete", ok: true },
  { label: "Required service event", value: "Recorded", ok: true },
  { label: "TSR condition", value: "Not satisfied", ok: false },
];

const Compliance = () => (
  <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
    <div className="border-b border-border/60 pb-5">
      <div className="flex items-center gap-2">
        <Badge className="bg-amber-500/10 text-status-warning border border-amber-500/30 font-semibold px-2.5 py-0.5 shadow-sm">
          <Scale className="h-3.5 w-3.5 mr-1 text-status-warning" /> Regulatory
          Protection & Audit
        </Badge>
      </div>
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1.5 text-foreground">
        Compliance & Billing Eligibility
      </h1>
      <p className="text-sm text-muted-foreground mt-0.5">
        CROA/state rules, billing eligibility engine, registration tracker, and
        AI marketing-compliance linter — encoded in software, not left to
        memory.
      </p>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">Billing eligibility engine</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A charge is never merely scheduled — it must satisfy the applicable
          federal, state, and channel rule first.
        </p>
        <div className="mt-5 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {billingEvents.map((b) => (
                <tr key={b.client} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{b.client}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.service}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs">
                      {b.channel} · {b.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {b.rule}
                  </td>
                  <td className="px-4 py-3">
                    {b.eligible ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-status-success">
                        <ShieldCheck className="h-3.5 w-3.5" /> Eligible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-status-danger">
                        <AlertTriangle className="h-3.5 w-3.5" /> Locked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-red-500/30 bg-card p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-status-danger" />
            <h2 className="font-semibold">
              Billing eligibility · Consumer Jane Doe
            </h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {eligibilityChecks.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-border bg-muted/30 p-4"
              >
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-status-danger" />
                  )}
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center">
            <p className="text-lg font-bold uppercase tracking-wider text-status-danger">
              Payment currently blocked
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Reason: Channel/service configuration requires additional
              eligibility criteria before a fee may be requested. The TSR
              waiting period has not been satisfied for this telemarketed
              account.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="outline">View rule</Button>
              <Button variant="outline">
                <Eye className="h-4 w-4" /> View evidence
              </Button>
              <Button className="bg-gradient-emerald text-white hover:opacity-90">
                Escalate to compliance <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              Audit event: BILLING_BLOCKED_POLICY_2026_08
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Telemarketed credit-repair fees are locked until documented results
          are held beyond the TSR waiting period. Overriding a block creates a
          high-severity compliance event requiring authorized approval.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-status-success" />
            <h2 className="font-semibold">Registration & bond tracker</h2>
          </div>
          <div className="mt-4 space-y-2">
            {registrations.map((r) => (
              <div
                key={r.code}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <span className="font-medium">{r.state}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {r.expires}
                  </span>
                  <Badge
                    className={
                      r.status === "Registered"
                        ? "bg-emerald-500/10 text-status-success"
                        : r.status === "Pending"
                          ? "bg-amber-500/10 text-status-warning"
                          : "bg-muted text-muted-foreground"
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-6 text-emerald-50 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold text-emerald-200">
              Contract & cancellation
            </h2>
          </div>
          <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
            Jurisdiction-specific contracts, disclosure versioning, and
            statutory cancellation dates are generated at onboarding from the
            consumer's state.
          </p>
          <Button
            variant="outline"
            className="mt-4 border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            Manage templates
          </Button>
        </div>
      </div>
    </div>

    <div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-status-success" />
        <h2 className="font-semibold">AI marketing-compliance linter</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Scans tenant landing pages, affiliate assets, and outreach copy for
        non-compliant claims before they publish.
      </p>
      <div className="mt-4 space-y-2">
        {linterFlags.map((f) => (
          <div
            key={f.text}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
          >
            <span className="font-mono text-muted-foreground">{f.text}</span>
            <Badge
              className={
                f.severity === "Block"
                  ? "bg-red-500/10 text-status-danger"
                  : "bg-amber-500/10 text-status-warning"
              }
            >
              {f.severity}
            </Badge>
          </div>
        ))}
      </div>
    </div>

    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
      <Scale className="mt-0.5 h-5 w-5 shrink-0 text-status-success" />
      <p className="text-sm text-muted-foreground">
        Compliance guidance shown here is product-strategy support, not legal
        advice. Have qualified counsel review your configuration, contracts, and
        marketing before launch.
      </p>
    </div>
  </div>
);

export default Compliance;
