import { useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  Sparkles,
  Palette,
  UserRound,
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
import { AiUsageSection } from "@/components/settings/sections/AiUsageSection";
import { OrganizationProfileSection } from "@/components/settings/sections/OrganizationProfileSection";
import { OrganizationPlanSection } from "@/components/settings/sections/OrganizationPlanSection";
import { LetterLibrarySection } from "@/components/settings/sections/LetterLibrarySection";
import { AccountSection } from "@/components/settings/sections/AccountSection";
import { OrganizationAutomationsSection } from "@/components/settings/sections/OrganizationAutomationsSection";
import { HubSection } from "@/components/settings/sections/HubSection";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";

const groups: SettingsGroup[] = [
  {
    label: "You",
    items: [{ key: "account", label: "Your account", icon: UserRound }],
  },
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
      { key: "kpi-catalogue", label: "KPI Catalogue", icon: BarChart3 },
    ],
  },
  {
    label: "Commercial",
    items: [
      { key: "billing", label: "Plans & Billing", icon: CreditCard },
      { key: "usage", label: "Usage & Metering", icon: Gauge },
      { key: "ai-credits", label: "AI Credits", icon: Sparkles },
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
    label: "You",
    items: [{ key: "account", label: "Your account", icon: UserRound }],
  },
  {
    label: "Organization",
    items: [
      { key: "profile", label: "Profile & branding", icon: Palette, permission: "settings.manage" },
      { key: "team", label: "Team Members", icon: Users, permission: "team.manage" },
      { key: "role-access", label: "Roles & access", icon: ShieldCheck, permission: "team.permissions" },
      { key: "workspace-views", label: "Workspace views", icon: LayoutGrid, permission: "workspaces.manage" },
      { key: "letters", label: "Letter Library", icon: FileText, permission: "creditops.letters.templates" },
      { key: "kpis", label: "KPIs", icon: BarChart3, permission: "settings.manage" },
      { key: "hub", label: "Organization Hub", icon: Boxes, permission: "settings.manage" },
      { key: "org-automations", label: "Automations", icon: Zap, permission: "settings.manage" },
      { key: "ai-usage", label: "AI usage", icon: Sparkles, permission: "billing.view" },
      { key: "plan", label: "Plan & billing", icon: CreditCard, permission: "billing.view" },
    ],
  },
];

const SettingsContent = () => {
  const { viewMode, activeOrganization } = useAgency();
  const auth = useAuth();
  const canEditKpis = auth.isAgencyStaff || auth.orgMemberships.some((m) => m.organization_id === activeOrganization?.id && m.role === "org_admin");
  /* The organization's own settings are written by its members: the database
     writers call member_can(), which refuses BES staff who are not members. */
  const canEditAsMember = auth.orgMemberships.some((m) => m.organization_id === activeOrganization?.id && (m.role === "org_admin" || m.role === "org_manager"));
  const isOrganizationView = viewMode === "subaccount";
  const permissions = usePermissions();
  /* Members see only the sections their role may use; the same keys guard the
     writers in the database. The first visible section opens by default. */
  const visibleOrganizationGroups = organizationGroups.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || permissions.can(i.permission)),
  }));
  const firstVisible = visibleOrganizationGroups[1]?.items[0]?.key ?? "account";
  const [params] = useSearchParams();
  /* Guides and links land on a section directly (…/settings?section=team);
     an unknown or not-permitted section falls back to the first visible one. */
  const requested = params.get("section");
  const requestedVisible = requested && (isOrganizationView ? visibleOrganizationGroups : groups).some((g) => g.items.some((i) => i.key === requested));
  const [chosen, setActive] = useState<string | null>(null);
  const active = chosen ?? (requestedVisible ? requested : isOrganizationView ? firstVisible : "branding");

  const render = () => {
    if (active === "account") return <AccountSection />;
    if (isOrganizationView) {
      if (active === "profile") return <OrganizationProfileSection canEdit={canEditKpis} />;
      if (active === "plan") return <OrganizationPlanSection />;
      if (active === "role-access") return <RoleAccessSection />;
      if (active === "workspace-views") return <WorkspaceViewsSection />;
      if (active === "ai-usage") return activeOrganization ? <AiUsageSection organizationId={activeOrganization.id} canEdit={canEditKpis} /> : null;
      if (active === "hub") return <HubSection organizationId={activeOrganization?.id ?? null} canEdit={canEditAsMember} />;
      if (active === "org-automations") return <OrganizationAutomationsSection organizationId={activeOrganization?.id ?? null} canEdit={canEditAsMember} />;
      if (active === "kpis") return activeOrganization ? <KpiSettingsSection organizationId={activeOrganization.id} canEdit={canEditKpis} /> : null;
      if (active === "letters") return activeOrganization ? <LetterLibrarySection organizationId={activeOrganization.id} /> : null;
      return activeOrganization ? <TeamMembersSection organizationId={activeOrganization.id} organizationName={activeOrganization.name} /> : null;
    }
    switch (active) {
      case "org-teams":
        return <OrganizationTeamsSection />;
      case "kpi-catalogue":
        return <KpiSettingsSection organizationId={null} canEdit={false} />;
      case "ai-credits":
        return activeOrganization ? <AiUsageSection organizationId={activeOrganization.id} canEdit /> : <p className="text-xs text-muted-foreground">Open an organization (Organizations → select) to see and grant its AI credits.</p>;
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
        groups={isOrganizationView ? visibleOrganizationGroups : groups}
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
