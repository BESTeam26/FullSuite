import {
  Users,
  UploadCloud,
  Bell,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Card } from "@/components/ui/card";

const MetricCard = ({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  tone?: string;
}) => (
  <Card className="p-5">
    <Icon className="h-5 w-5 text-muted-foreground" />
    <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
  </Card>
);

export const MgmtOverview = () => {
  const { people, conversions } = useDiyManagement();

  const active = people.filter(
    (p) =>
      p.diy?.status === "in-progress" || p.diy?.status === "awaiting-reimport",
  );
  const newCount = people.filter((p) => p.status === "invited").length;
  const reportsImported = people.filter((p) => p.diy?.lastReportDate).length;
  const needsAction = people.filter(
    (p) =>
      p.diy?.status === "in-progress" &&
      (p.diy?.journeyStep === "confirm-facts" ||
        p.diy?.journeyStep === "upload-evidence" ||
        p.diy?.journeyStep === "identify-issues"),
  ).length;
  const reviewsDue = people.filter((p) => p.diy?.nextReviewDate).length;
  const convertedManaged = conversions.filter(
    (c) => c.type === "diy_to_managed_credit" && c.state === "completed",
  ).length;
  const fundingRefs = conversions.filter(
    (c) =>
      (c.type === "diy_to_funding_readiness" ||
        c.type === "diy_to_fundingops") &&
      c.state !== "declined",
  ).length;
  const completed = people.filter((p) => p.diy?.status === "completed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          DIY Credit Program Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational metrics for your white-label DIY credit consumers.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Active consumers"
          value={active.length}
          icon={Users}
          tone="text-emerald-700"
        />
        <MetricCard
          label="New this period"
          value={newCount}
          icon={TrendingUp}
          tone="text-blue-700"
        />
        <MetricCard
          label="Reports imported"
          value={reportsImported}
          icon={UploadCloud}
          tone="text-amber-700"
        />
        <MetricCard
          label="Needs consumer action"
          value={needsAction}
          icon={Bell}
          tone="text-red-600"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Progress reviews due"
          value={reviewsDue}
          icon={Clock}
          tone="text-purple-700"
        />
        <MetricCard
          label="Converted to managed service"
          value={convertedManaged}
          icon={ArrowRightLeft}
          tone="text-emerald-700"
        />
        <MetricCard
          label="Funding readiness referrals"
          value={fundingRefs}
          icon={Banknote}
          tone="text-amber-700"
        />
        <MetricCard
          label="Completed journeys"
          value={completed}
          icon={CheckCircle2}
          tone="text-emerald-700"
        />
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <div className="mt-4 space-y-2">
          {useDiyManagement()
            .activity.slice(0, 8)
            .map((a) => {
              const person = people.find((p) => p.id === a.personId);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {person?.name || "Unknown"} · {a.type}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {a.date}
                  </span>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
};
