import { useAgency } from "@/lib/agency-context";
import { AgencyDashboard } from "@/components/dashboard/AgencyDashboard";
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  MailWarning,
  Inbox,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";

const opsToday = [
  {
    label: "Need review",
    value: 42,
    icon: AlertTriangle,
    cls: "text-amber-600 bg-amber-500/10",
  },
  {
    label: "Await consumer",
    value: 18,
    icon: Clock,
    cls: "text-blue-600 bg-blue-500/10",
  },
  {
    label: "Ready for QA",
    value: 31,
    icon: FileCheck2,
    cls: "text-indigo-600 bg-indigo-500/10",
  },
  {
    label: "Responses",
    value: 27,
    icon: Inbox,
    cls: "text-emerald-600 bg-emerald-500/10",
  },
  {
    label: "Over SLA",
    value: 8,
    icon: MailWarning,
    cls: "text-red-600 bg-red-500/10",
  },
  {
    label: "Compliance holds",
    value: 6,
    icon: ShieldAlert,
    cls: "bg-purple-500/10 text-purple-600",
  },
];

const scoreData = [
  { m: "Jan", score: 612 },
  { m: "Feb", score: 624 },
  { m: "Mar", score: 638 },
  { m: "Apr", score: 651 },
  { m: "May", score: 669 },
  { m: "Jun", score: 684 },
  { m: "Jul", score: 701 },
  { m: "Aug", score: 718 },
];

const Dashboard = () => {
  const agencyContext = useAgency();

  const viewMode = agencyContext?.viewMode || "agency";
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const activeOrganization = agencyContext?.activeOrganization || null;
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});
  const isProductOn = agencyContext?.isProductOn || (() => false);
  const activeOrgWork = agencyContext?.activeOrgWork || [];

  // Render Agency Dashboard if in Agency View (BES HQ scope)
  if (viewMode === "agency") {
    return <AgencyDashboard />;
  }

  const creditOn = isProductOn("creditOps");
  const fundingOn = isProductOn("fundingOps");

  // Render Sub-Account Specific Dashboard if in Sub-Account View
  // Scope: ORGANIZATION — this org's own self-managed work only.
  // BES fulfillment work (AGENCY scope) is NOT shown here.
  return (
    <div className="p-6 md:p-8">
      {/* Sub-Account Header Indicator */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-emerald text-white font-bold text-sm">
            {activeSubAccount?.code.slice(0, 2) || "SA"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">
                {activeSubAccount?.name || "Sub-Account Operational Workspace"}
              </h1>
              <Badge
                variant="outline"
                className="text-xs border-emerald-500/40 text-emerald-600"
              >
                {activeSubAccount?.plan} Plan
              </Badge>
              {activeSubAccount?.isFulfillmentSubscriber && (
                <Badge className="bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[10px]">
                  HQ Fulfillment Subscriber
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Principal: {activeOrganization?.principal.name} (
              {activeOrganization?.principal.email}) ·{" "}
              {activeOrganization?.businesses.length ?? 0} business(es)
            </p>
          </div>
        </div>

        <button
          onClick={switchToAgencyView}
          className="text-xs font-semibold text-amber-500 hover:underline flex items-center gap-1"
        >
          <Building2 className="h-3.5 w-3.5" /> Return to Master Agency HQ
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {activeSubAccount?.name} Operations Today
        </h1>
        <p className="text-sm text-muted-foreground">
          Self-managed work for this organization.{" "}
          {activeSubAccount?.isFulfillmentSubscriber
            ? "Eligible fulfillment work is streamed to BES HQ."
            : "BES fulfillment is not active for this account."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {opsToday.map((o) => (
          <div
            key={o.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${o.cls}`}
              >
                <o.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {o.label}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold">{o.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-semibold">Organization work queue</h2>
            {creditOn && (
              <Link
                to="/app/operations"
                className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline"
              >
                Open console <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Work ID</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium">SLA</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeOrgWork.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      No self-managed work items for this organization.
                    </td>
                  </tr>
                ) : (
                  activeOrgWork.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30">
                      <td className="px-5 py-4 font-mono text-xs font-medium text-emerald-600">
                        {w.id}
                      </td>
                      <td className="px-5 py-4 font-medium">{w.title}</td>
                      <td className="px-5 py-4 text-muted-foreground capitalize">
                        {w.relatedType.replace("_", " ")}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            w.stage === "Ready for QA"
                              ? "bg-amber-500/10 text-amber-600"
                              : w.stage === "Queued"
                                ? "bg-slate-500/10 text-slate-600"
                                : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {w.stage}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {w.slaHoursRemaining}h
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {w.assignedTo ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          {creditOn && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-semibold">Compliance & Billing Status</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Contracts active
                  </span>
                  <span className="font-semibold text-emerald-600">100%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Registration state
                  </span>
                  <span className="font-semibold text-emerald-600">
                    Verified
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Fulfillment sync
                  </span>
                  <span className="font-semibold text-emerald-600">
                    {activeSubAccount?.isFulfillmentSubscriber
                      ? "Auto-Streaming to HQ"
                      : "Self-Managed"}
                  </span>
                </div>
              </div>
              <Link
                to="/app/compliance"
                className="mt-4 flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline"
              >
                Review compliance <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Sub-Account Performance</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Client MRR</span>
                <span className="font-semibold">
                  ${activeSubAccount?.monthlyRevenue.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Active End-Clients
                </span>
                <span className="font-semibold">
                  {activeSubAccount?.activeClients}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">QA pass rate</span>
                <span className="font-semibold text-emerald-600">98.4%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Client portfolio score trend</h2>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Avg client
            FICO
          </span>
        </div>
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={scoreData}>
              <defs>
                <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="m"
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={[600, 730]}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#10B981"
                strokeWidth={2.5}
                fill="url(#scoreFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
