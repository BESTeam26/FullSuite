import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  MailPlus,
  CreditCard,
  ArrowRightLeft,
  Palette,
  Settings,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { isDiyEntitled } from "@/lib/diy/diy-domain";
import { Link } from "react-router-dom";
import { MgmtOverview } from "@/components/diy/management/MgmtOverview";
import { MgmtConsumers } from "@/components/diy/management/MgmtConsumers";
import { MgmtInvitations } from "@/components/diy/management/MgmtInvitations";
import { MgmtConversions } from "@/components/diy/management/MgmtConversions";
import { MgmtBranding } from "@/components/diy/management/MgmtBranding";
import { MgmtPlans, MgmtSettings } from "@/components/diy/management/MgmtPlans";
import { SampleContentNotice } from "@/components/dashboard/SampleContentNotice";

export type MgmtView =
  | "overview"
  | "consumers"
  | "invitations"
  | "plans"
  | "conversions"
  | "branding"
  | "settings";

const nav: { key: MgmtView; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "consumers", label: "Consumers", icon: Users },
  { key: "invitations", label: "Invitations", icon: MailPlus },
  { key: "plans", label: "Plans & Pricing", icon: CreditCard },
  { key: "conversions", label: "Conversions", icon: ArrowRightLeft },
  { key: "branding", label: "White-Label", icon: Palette },
  { key: "settings", label: "Settings", icon: Settings },
];

const renderView = (view: MgmtView) => {
  switch (view) {
    case "overview":
      return <MgmtOverview />;
    case "consumers":
      return <MgmtConsumers />;
    case "invitations":
      return <MgmtInvitations />;
    case "plans":
      return <MgmtPlans />;
    case "conversions":
      return <MgmtConversions />;
    case "branding":
      return <MgmtBranding />;
    case "settings":
      return <MgmtSettings />;
    default:
      return <MgmtOverview />;
  }
};

export const DiyManagementShell = () => {
  const { orgName, entitlements, whiteLabel } = useDiyManagement();
  const [view, setView] = useState<MgmtView>("overview");

  if (!isDiyEntitled(entitlements)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-12 text-center">
        <SampleContentNotice what="The DIY Credit management workspace runs on an in-memory example organization; enrolments, conversions and activity here are illustrations until the DIY data model is built." />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">DIY Credit is not enabled</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            This module is hidden because your organization does not have the
            BES DIY Credit entitlement. Contact BES to add it.
          </p>
        </div>
        <Link
          to="/app"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-card p-3 lg:block">
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-gold text-xs font-bold text-charcoal">
              {orgName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{orgName}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                DIY Credit Management
              </p>
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                view === n.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <p className="mt-2 text-xs font-semibold text-amber-700">
            White-label active
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Your consumers see "{whiteLabel.programName}" — not BES branding.
          </p>
        </div>
      </aside>

      <div className="flex w-full flex-col">
        <div className="flex overflow-x-auto border-b border-border px-2 py-2 lg:hidden">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                view === n.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </button>
          ))}
        </div>
        <main className="flex-1 p-4 md:p-8">{renderView(view)}</main>
      </div>
    </div>
  );
};
