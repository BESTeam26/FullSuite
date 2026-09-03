import { useState } from "react";
import { useAgency, type SubAccount } from "@/lib/agency-context";
import { Building2, Plus, Search, Palette, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { WhitelabelConfigurator } from "./WhitelabelConfigurator";
import { SubAccountsListView } from "./SubAccountsListView";
import { ProvisionSubAccountModal } from "./ProvisionSubAccountModal";

export const SubAccountsManager = () => {
  const {
    subAccounts,
    switchToSubAccount,
    togglePinSubAccount,
    toggleFulfillmentSubscription,
    updateSubAccountBranding,
    addSubAccount,
  } = useAgency();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("ALL");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("ALL");
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [editingBrandingSub, setEditingBrandingSub] =
    useState<SubAccount | null>(null);

  const filtered = subAccounts.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.address && s.address.toLowerCase().includes(search.toLowerCase()));

    const matchesPlan = planFilter === "ALL" || s.plan === planFilter;
    const matchesFulfillment =
      fulfillmentFilter === "ALL" ||
      (fulfillmentFilter === "DFY" && s.isFulfillmentSubscriber) ||
      (fulfillmentFilter === "SELF" && !s.isFulfillmentSubscriber);

    return matchesSearch && matchesPlan && matchesFulfillment;
  });

  // Sort pinned first
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const handleCreate = (acc: {
    name: string;
    code: string;
    ownerName: string;
    ownerEmail: string;
    plan: SubAccount["plan"];
    isFulfillmentSubscriber: boolean;
  }) => {
    addSubAccount({
      ...acc,
      activeClients: 0,
      monthlyRevenue:
        acc.plan === "Full Suite"
          ? 2499
          : acc.plan === "CreditOps"
            ? 999
            : 1499,
      status: "Active",
      modules: {
        creditOps: acc.plan === "CreditOps" || acc.plan === "Full Suite",
        fundingOps: acc.plan === "FundingOps" || acc.plan === "Full Suite",
        diyCredit: true,
        crm: acc.plan === "BES CRM" || acc.plan === "Full Suite",
      },
    });

    toast({
      title: "Sub-Account Created",
      description: `${acc.name} has been provisioned as a new sub-account!`,
    });
    setOpenAddDialog(false);
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/20 text-status-warning border border-amber-500/30">
              Platform Sub-Accounts Hub
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
            Sub-Account Companies ({subAccounts.length})
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Provision, manage, pin, and configure whitelabel settings &
            fulfillment subscriptions for tenant companies.
          </p>
        </div>

        <Button
          onClick={() => setOpenAddDialog(true)}
          className="bg-gradient-gold text-charcoal font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Provision New Sub-Account
        </Button>
      </div>

      {/* Dialog for Provisioning */}
      <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
        {openAddDialog && (
          <ProvisionSubAccountModal
            onClose={() => setOpenAddDialog(false)}
            onCreate={handleCreate}
          />
        )}
      </Dialog>

      {/* Dialog for Whitelabel Configurator */}
      <Dialog
        open={!!editingBrandingSub}
        onOpenChange={(open) => !open && setEditingBrandingSub(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-status-warning" /> Whitelabel
              Branding — {editingBrandingSub?.name}
            </DialogTitle>
          </DialogHeader>
          {editingBrandingSub && (
            <WhitelabelConfigurator
              subAccount={editingBrandingSub}
              onSave={(id, branding) => {
                updateSubAccountBranding(id, branding);
                toast({
                  title: "Whitelabel Updated",
                  description: `Custom domain & brand theme saved for ${editingBrandingSub.name}!`,
                });
              }}
              onClose={() => setEditingBrandingSub(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by company, owner, code, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[140px] text-xs h-9">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                <SelectItem value="Full Suite">Full Suite</SelectItem>
                <SelectItem value="CreditOps">CreditOps</SelectItem>
                <SelectItem value="FundingOps">FundingOps</SelectItem>
                <SelectItem value="BES CRM">BES CRM</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={fulfillmentFilter}
              onValueChange={setFulfillmentFilter}
            >
              <SelectTrigger className="w-[150px] text-xs h-9">
                <SelectValue placeholder="Fulfillment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Fulfillment</SelectItem>
                <SelectItem value="DFY">HQ DFY Subscribers</SelectItem>
                <SelectItem value="SELF">Self-Managed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* RENDER LIST VIEW ONLY */}
      <SubAccountsListView
        subAccounts={sortedFiltered}
        onSwitch={switchToSubAccount}
        onToggleDFY={toggleFulfillmentSubscription}
        onTogglePin={togglePinSubAccount}
        onConfigureBranding={(sub) => setEditingBrandingSub(sub)}
      />
    </div>
  );
};
