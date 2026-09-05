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
  LayoutGrid,
  BarChart3,
} from "lucide-react";
import {
  AgencySettingsProvider,
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
import { WorkspaceViewsSection } from "@/components/settings/sections/OrganizationSections";
import { RoleAccessSection } from "@/components/settings/sections/RoleAccessSection";
import { OrganizationTeamsSection, TeamMembersSection } from "@/components/settings/sections/TeamMembersSection";
import { KpiSettingsSection } from "@/components/settings/sections/KpiSettingsSection";
import { LetterLibrarySection } from "@/components/settings/sections/LetterLibrarySection";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";

const groups: SettingsGroup[] = [
  {
    label: "General",
    items: [
      { key: "branding", label: "Agency & Branding", icon: Building2 },
      { key: "subaccounts", label: "Organizations", icon: Network },
      { key: "products", label: "Products & Entitlements", icon: Boxes },
    ],
  },
  {
    label: "People & Access",
    items: [
      { key: "users", label: "Agency Users", icon: Users },
      { key: "org-teams", label: "Organization Teams", icon: Users },
      { key: "kpi-catalogue", label: "KPI Catalogue", icon: BarChart3 },
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

/* Organization view: the organization's own settings. Agency configuration is
   not offered here — an organization user must not see BES's controls. */
const organizationGroups: SettingsGroup[] = [
  {
    label: "Organization",
    items: [
      { key: "team", label: "Team Members", icon: Users },
      { key: "role-access", label: "Roles & access", icon: ShieldCheck },
      { key: "workspace-views", label: "Workspace views", icon: LayoutGrid },
      { key: "letters", label: "Letter Library", icon: FileText },
      { key: "kpis", label: "KPIs", icon: BarChart3 },
    ],
  },
];

const SettingsContent = () => {
  const { viewMode, activeOrganization } = useAgency();
  const auth = useAuth();
  const canEditKpis = auth.isAgencyStaff || auth.orgMemberships.some((m) => m.organization_id === activeOrganization?.id && m.role === "org_admin");
  const isOrganizationView = viewMode === "subaccount";
  const [active, setActive] = useState(isOrganizationView ? "team" : "branding");

  const render = () => {
    if (isOrganizationView) {
      if (active === "role-access") return <RoleAccessSection />;
      if (active === "workspace-views") return <WorkspaceViewsSection />;
      if (active === "kpis") return activeOrganization ? <KpiSettingsSection organizationId={activeOrganization.id} canEdit={canEditKpis} /> : null;
      if (active === "letters") return activeOrganization ? <LetterLibrarySection organizationId={activeOrganization.id} /> : null;
      return activeOrganization ? <TeamMembersSection organizationId={activeOrganization.id} organizationName={activeOrganization.name} /> : null;
    }
    switch (active) {
      case "org-teams":
        return <OrganizationTeamsSection />;
      case "kpi-catalogue":
        return <KpiSettingsSection organizationId={null} canEdit={false} />;
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
      <AgencySettingsShell
        groups={isOrganizationView ? organizationGroups : groups}
        active={active}
        onSelect={setActive}
        {...(isOrganizationView
          ? {
              eyebrow: activeOrganization?.publicId
                ? `Organization ID ${activeOrganization.publicId}`
                : "Organization",
              title: `${activeOrganization?.name ?? "Organization"} Settings`,
              description:
                "Settings for this organization only. Changes here apply to everyone in it.",
            }
          : {})}
      >
        {render()}
      </AgencySettingsShell>
      {/* No page-level "Save changes": it only flipped a flag. Sections that
          persist (Agency & Brand) carry their own real save; the rest state
          plainly that they are not wired yet. */}
    </div>
  );
};

const Settings = () => (
  <AgencySettingsProvider>
    <SettingsContent />
  </AgencySettingsProvider>
);

export default Settings;
