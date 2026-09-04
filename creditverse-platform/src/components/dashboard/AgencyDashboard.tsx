import { useAgency } from "@/lib/agency-context";
import { Building2, Sparkles, Crown, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { SubAccountInvoicingMetering } from "./SubAccountInvoicingMetering";
import { AgencySnapshot } from "./agency/AgencySnapshot";
import { useAttention } from "@/lib/data/use-work";
import { AttentionCenter } from "./agency/AttentionCenter";
import { HealthPanels } from "./agency/HealthPanels";
import { FulfillmentHealthPanel } from "./agency/FulfillmentHealthPanel";
import { RevenueAndDiyPanels } from "./agency/RevenueAndDiyPanels";
import { SubAccountMiniGrid } from "./agency/SubAccountMiniGrid";
import { HqUpdatesPanel } from "./agency/HqUpdatesPanel";

export const AgencyDashboard = () => {
  const attention = useAttention();
  const { subAccounts, workOrders, switchToSubAccount } = useAgency();
  const navigate = useNavigate();

  const totalClients = subAccounts.reduce((acc, s) => acc + s.activeClients, 0);
  const totalMrr = subAccounts.reduce((acc, s) => acc + s.monthlyRevenue, 0);
  const fulfillmentSubscribers = subAccounts.filter(
    (s) => s.isFulfillmentSubscriber,
  );
  const pendingWorkOrders = workOrders.filter((w) => w.status !== "Completed");

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* ===== HEADER ===== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/10 text-status-warning border border-amber-500/30 font-semibold">
              <Crown className="h-3 w-3 mr-1" /> Blessed Empire Services HQ
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1.5 text-foreground">
            Good morning, Platform Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Managing {subAccounts.length} organizations across the BES
            ecosystem.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/app/subaccounts")}
            className="bg-amber-500 hover:bg-amber-600 text-charcoal font-bold shadow-sm"
          >
            <Building2 className="h-4 w-4 mr-1.5" /> Add Organization
          </Button>
          <Button
            variant="outline"
            className="border-emerald-500/30 text-status-success hover:bg-emerald-500/10 font-semibold"
          >
            <Sparkles className="h-4 w-4 mr-1.5" /> Ask Lina
          </Button>
        </div>
      </div>

      {/* ===== EXECUTIVE SNAPSHOT ===== */}
      <AgencySnapshot
        totalMrr={totalMrr}
        subAccountsCount={subAccounts.length}
        totalClients={totalClients}
        dfyCount={fulfillmentSubscribers.length}
        needsAttention={attention.items.length}
      />

      {/* ===== NEEDS YOUR ATTENTION ===== */}
      <AttentionCenter />

      {/* ===== PLATFORM + ORGANIZATION HEALTH ===== */}
      <HealthPanels />

      {/* ===== FULFILLMENT HEALTH ===== */}
      <FulfillmentHealthPanel pendingWorkOrders={pendingWorkOrders} />

      {/* ===== REVENUE MIX + DIY CREDIT ===== */}
      <RevenueAndDiyPanels />

      {/* ===== ORGANIZATION QUICK SWITCH ===== */}
      <SubAccountMiniGrid
        subAccounts={subAccounts}
        onSwitch={switchToSubAccount}
      />

      {/* ===== METERED INVOICING ===== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="h-4 w-4 text-status-warning" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Organization Invoicing & Usage Metering
          </h2>
        </div>
        <SubAccountInvoicingMetering />
      </div>

      {/* ===== HQ UPDATES ===== */}
      <HqUpdatesPanel />
    </div>
  );
};
