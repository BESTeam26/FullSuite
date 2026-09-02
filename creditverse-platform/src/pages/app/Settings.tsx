import { useState } from "react";
import {
  Building2,
  Network,
  Boxes,
  Users,
  ShieldCheck,
  Workflow,
  CreditCard,
  Banknote,
  Gift,
  FileText,
  Zap,
  Gauge,
  Plug,
  MonitorSmartphone,
  Bell,
  Lock,
  ScrollText,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import {
  AgencySettingsProvider,
  useAgencySettings,
} from "@/lib/agency-settings-context";
import {
  AgencySettingsShell,
  type SettingsGroup,
} from "@/components/settings/AgencySettingsShell";
import { CrmAutomationManager } from "@/components/settings/CrmAutomationManager";
import { ConnectorWizard } from "@/components/settings/ConnectorWizard";
import { AgreementsManager } from "@/components/settings/AgreementsManager";
import {
  AgencyBrandingSection,
  SubAccountsSection,
  ProductsSection,
  AgencyUsersSection,
  RolesPermissionsSection,
  AgencyStructureSection,
} from "@/components/settings/sections/GeneralSections";
import {
  FulfillmentSection,
  CreditOpsSection,
  FundingOpsSection,
  DiyReferralsSection,
  TemplatesSection,
  AutomationsSection,
} from "@/components/settings/sections/OperationsSections";
import {
  BillingSection,
  UsageSection,
  IntegrationsSection,
  PortalsSection,
  NotificationsSection,
  SecuritySection,
  AuditSection,
  SystemControlsSection,
  DangerZoneSection,
} from "@/components/settings/sections/PlatformSections";

const groups: SettingsGroup[] = [
  {
    label: "General",
    items: [
      { key: "branding", label: "Agency & Branding", icon: Building2 },
      { key: "subaccounts", label: "Sub-Accounts", icon: Network },
      { key: "products", label: "Products & Entitlements", icon: Boxes },
    ],
  },
  {
    label: "People & Access",
    items: [
      { key: "users", label: "Agency Users", icon: Users },
      { key: "permissions", label: "Roles & Permissions", icon: ShieldCheck },
      { key: "structure", label: "Divisions / Teams", icon: Network },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "fulfillment", label: "Fulfillment", icon: Workflow },
      { key: "creditops", label: "CreditOps", icon: CreditCard },
      { key: "fundingops", label: "FundingOps", icon: Banknote },
      { key: "diy", label: "DIY & Referrals", icon: Gift },
      { key: "templates", label: "Templates", icon: FileText },
      { key: "automations", label: "Automations", icon: Zap },
    ],
  },
  {
    label: "Commercial",
    items: [
      { key: "billing", label: "Plans & Billing", icon: CreditCard },
      { key: "usage", label: "Usage & Metering", icon: Gauge },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "integrations", label: "Integrations", icon: Plug },
      { key: "crm", label: "CRM Automation Bridge", icon: Zap },
      { key: "connectors", label: "Credit Data Connectors", icon: Plug },
      { key: "agreements", label: "Agreements (CROA)", icon: FileText },
      { key: "portals", label: "Portals", icon: MonitorSmartphone },
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "security", label: "Security", icon: Lock },
      { key: "audit", label: "Audit Log", icon: ScrollText },
      { key: "system", label: "System Controls", icon: SlidersHorizontal },
      { key: "danger", label: "Danger Zone", icon: AlertTriangle },
    ],
  },
];

const SettingsContent = () => {
  const [active, setActive] = useState("branding");
  const { saved, markSaved } = useAgencySettings();

  const render = () => {
    switch (active) {
      case "branding":
        return <AgencyBrandingSection />;
      case "subaccounts":
        return <SubAccountsSection />;
      case "products":
        return <ProductsSection />;
      case "users":
        return <AgencyUsersSection />;
      case "permissions":
        return <RolesPermissionsSection />;
      case "structure":
        return <AgencyStructureSection />;
      case "fulfillment":
        return <FulfillmentSection />;
      case "creditops":
        return <CreditOpsSection />;
      case "fundingops":
        return <FundingOpsSection />;
      case "diy":
        return <DiyReferralsSection />;
      case "templates":
        return <TemplatesSection />;
      case "automations":
        return <AutomationsSection />;
      case "billing":
        return <BillingSection />;
      case "usage":
        return <UsageSection />;
      case "integrations":
        return <IntegrationsSection />;
      case "crm":
        return <CrmAutomationManager />;
      case "connectors":
        return <ConnectorWizard />;
      case "agreements":
        return <AgreementsManager />;
      case "portals":
        return <PortalsSection />;
      case "notifications":
        return <NotificationsSection />;
      case "security":
        return <SecuritySection />;
      case "audit":
        return <AuditSection />;
      case "system":
        return <SystemControlsSection />;
      case "danger":
        return <DangerZoneSection />;
      default:
        return <AgencyBrandingSection />;
    }
  };

  return (
    <div className="p-6 md:p-8">
      <AgencySettingsShell groups={groups} active={active} onSelect={setActive}>
        {render()}
        {saved && (
          <div className="fixed bottom-6 right-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            Settings saved ✓
          </div>
        )}
      </AgencySettingsShell>
      <div className="mx-auto mt-4 flex max-w-7xl justify-end">
        <button
          onClick={markSaved}
          className="rounded-lg bg-gradient-green px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          Save changes
        </button>
      </div>
    </div>
  );
};

const Settings = () => (
  <AgencySettingsProvider>
    <SettingsContent />
  </AgencySettingsProvider>
);

export default Settings;
