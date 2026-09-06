import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RoleProvider } from "@/lib/role-context";
import { ReferralProvider } from "@/lib/referral/referral-context";
import { AgencyProvider } from "@/lib/agency-context";
import { MonitoringStatusProvider } from "@/lib/monitoring-status";
import { AgreementsProvider } from "@/lib/agreements-context";
import { ConnectorsProvider } from "@/lib/connectors-context";
import { CrmAutomationProvider } from "@/lib/crm-automation-context";
import { AgencySettingsProvider } from "@/lib/agency-settings-context";
import { AuthProvider } from "@/lib/auth/auth-context";
import { RequirePortalClient } from "@/components/auth/RequirePortalClient";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireAgencyStaff } from "@/components/auth/RequireAgencyStaff";
import { RequireEntitlement } from "./components/auth/RequireEntitlement";
import { RequirePermission } from "./components/auth/RequirePermission";
import { RequireHubModule } from "./components/auth/RequireHubModule";
import { HubOrAgencyPage } from "./components/auth/HubOrAgencyPage";
import { FundingOpsAccessProvider } from "@/lib/fulfillment/fundingops-access";

/* ------------------------------------------------------------------ */
/* Route-level code splitting                                          */
/* Marketing, portals, and the /app workspace load as separate chunks. */
/* ------------------------------------------------------------------ */

const named =
  <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  () =>
    loader().then((m) => ({ default: m[key] as ComponentType }));

// Auth
const Login = lazy(() => import("./pages/auth/Login"));
const AcceptInvitation = lazy(() => import("./pages/auth/AcceptInvitation"));
const SignUp = lazy(() => import("./pages/auth/SignUp"));
const BorrowerPortal = lazy(() => import("./pages/portals/BorrowerPortal"));
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback"));

// Public / marketing
const Index = lazy(() => import("./pages/Index"));
const ClientPortal = lazy(() => import("./pages/portal/ClientPortal"));
const Channels = lazy(() => import("./pages/app/Channels"));
const Commissions = lazy(() => import("./pages/app/Commissions"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DiyNotBuilt = lazy(() => import("./pages/DiyNotBuilt"));
const AffiliatePortal = lazy(() => import("./pages/portals/PortalPreviewsRemoved").then((m) => ({ default: m.AffiliatePortalPreview })));
const OutsourcingPortal = lazy(() => import("./pages/portals/PortalPreviewsRemoved").then((m) => ({ default: m.OutsourcingPortalPreview })));
const DiyCreditPage = lazy(() => import("./pages/products/DiyCreditPage"));
const CreditOpsPage = lazy(() => import("./pages/products/CreditOpsPage"));
const FundingOpsPage = lazy(() => import("./pages/products/FundingOpsPage"));
const FullSuitePage = lazy(() => import("./pages/products/FullSuitePage"));
const CrmPage = lazy(() => import("./pages/products/CrmPage"));
const CreditRepairSoftwarePage = lazy(
  () => import("./pages/seo/CreditRepairSoftwarePage"),
);
const FundingOperationsSoftwarePage = lazy(
  () => import("./pages/seo/FundingOperationsSoftwarePage"),
);
const CreditRepairBusinessSoftwarePage = lazy(
  () => import("./pages/seo/CreditRepairBusinessSoftwarePage"),
);
const BusinessFundingSoftwarePage = lazy(
  () => import("./pages/seo/BusinessFundingSoftwarePage"),
);
const CreditRepairAndFundingSoftwarePage = lazy(
  () => import("./pages/seo/CreditRepairAndFundingSoftwarePage"),
);
const IntegrationsPage = lazy(() => import("./pages/seo/IntegrationsPage"));

// Workspace shell
const DashboardLayout = lazy(
  named(
    () => import("@/components/dashboard/DashboardLayout"),
    "DashboardLayout",
  ),
);
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Workspaces = lazy(() => import("./pages/app/Workspaces"));
const OrganizationDashboard = lazy(() => import("./pages/app/OrganizationDashboard"));
const Clients = lazy(() => import("./pages/app/Clients"));
const ClientProfile = lazy(() => import("./pages/app/ClientProfile"));
const CreditCases = lazy(() => import("./pages/app/CreditCases"));
const ClientDetail = lazy(() => import("./pages/app/ClientDetail"));
const FundingFiles = lazy(() => import("./pages/app/FundingFiles"));
const FundingFileDetail = lazy(() => import("./pages/app/FundingFileDetail"));
const Lenders = lazy(() => import("./pages/app/Lenders"));
const FundingDashboard = lazy(() => import("./pages/app/FundingDashboard"));
const DisputeDashboard = lazy(() => import("./pages/app/DisputeDashboard"));
const FundingDeals = lazy(() => import("./pages/app/FundingDeals"));
const Compliance = lazy(() => import("./pages/app/Compliance"));
const OrganizationCreditOps = lazy(
  () => import("./pages/app/OrganizationCreditOps"),
);
const OrganizationFundingOps = lazy(
  () => import("./pages/app/OrganizationFundingOps"),
);
const Reporting = lazy(() => import("./pages/app/Reporting"));
const Education = lazy(() => import("./pages/app/Education"));
const Settings = lazy(() => import("./pages/app/Settings"));

const CreditOps = lazy(() => import("./pages/app/CreditOps"));
const FundingOps = lazy(() => import("./pages/app/FundingOps"));
const BesCrm = lazy(() => import("./pages/app/BesCrm"));
const TalentOps = lazy(() => import("./pages/app/TalentOps"));
const SubAccountsManager = lazy(
  named(
    () => import("@/components/dashboard/SubAccountsManager"),
    "SubAccountsManager",
  ),
);
const FulfillmentWorkspace = lazy(
  named(
    () => import("@/components/dashboard/FulfillmentWorkspace"),
    "FulfillmentWorkspace",
  ),
);

// HQ pages (named exports)
const hq = () => import("./pages/app/HqPages");
const hq2 = () => import("./pages/app/HqPages2");
const AttentionCenter = lazy(named(hq, "AttentionCenter"));
const MyWorkPage = lazy(named(hq, "MyWorkPage"));
// Time and EOD now load real data, so they live in their own modules and
// lazy-load independently of the other HQ pages.
const MyTimePage = lazy(
  named(() => import("./pages/app/MyTimePage"), "MyTimePage"),
);
const EodPage = lazy(named(() => import("./pages/app/EodPage"), "EodPage"));
const NotificationsPage = lazy(named(hq, "NotificationsPage"));
const PeoplePage = lazy(named(hq2, "PeoplePage"));
const TeamsPage = lazy(named(hq2, "TeamsPage"));
const WorkforcePage = lazy(named(hq2, "WorkforcePage"));
const BillingPage = lazy(named(hq2, "BillingPage"));
const AnnouncementsPage = lazy(named(hq2, "AnnouncementsPage"));
const CalendarPage = lazy(named(hq2, "CalendarPage"));
const CompanyPeople = lazy(() => import("./pages/app/CompanyPeople"));
const CompanyDepartments = lazy(() => import("./pages/app/CompanyDepartments"));
const CompanyTools = lazy(() => import("./pages/app/CompanyTools"));
const CompanyFiles = lazy(() => import("./pages/app/CompanyFiles"));
const SupportPage = lazy(named(hq2, "SupportPage"));

const queryClient = new QueryClient();

/* A page-shaped placeholder while a lazy screen loads: the layout the screen
   will take (title, tiles, a card) instead of a spinner, so nothing jumps
   when it arrives (rule 15: loading preserves layout). */
const RouteFallback = () => (
  <div className="animate-pulse p-6 md:p-8" aria-busy="true" aria-label="Loading">
    <div className="mb-6 h-7 w-56 rounded-lg bg-muted" />
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl border border-border bg-card" />)}
    </div>
    <div className="h-64 rounded-xl border border-border bg-card" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ReferralProvider>
            <RoleProvider>
              <AgencyProvider>
                <MonitoringStatusProvider>
                  <AgencySettingsProvider>
                    <AgreementsProvider>
                      <ConnectorsProvider>
                        <CrmAutomationProvider>
                          <Suspense fallback={<RouteFallback />}>
                            <Routes>
                              <Route path="/" element={<Index />} />
                              <Route path="/signup" element={<SignUp />} />
                          <Route path="/login" element={<Login />} />
                              <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
                              <Route
                                path="/portal/funding"
                                element={
                                  <RequireAuth>
                                    <BorrowerPortal />
                                  </RequireAuth>
                                }
                              />
                              <Route
                                path="/auth/callback"
                                element={<AuthCallback />}
                              />
                              {/* C3: one client identity, one portal. The guard
                                  decides routing; row-level security decides what
                                  is inside. */}
                              <Route
                                path="/portal"
                                element={
                                  <RequirePortalClient>
                                    <ClientPortal />
                                  </RequirePortalClient>
                                }
                              />
                              <Route path="/diy" element={<DiyNotBuilt />} />
                              <Route
                                path="/diy-consumer"
                                element={<DiyNotBuilt />}
                              />
                              <Route
                                path="/affiliate"
                                element={<AffiliatePortal />}
                              />
                              <Route
                                path="/outsourcing"
                                element={<OutsourcingPortal />}
                              />

                              {/* Product pages */}
                              <Route
                                path="/diy-credit"
                                element={<DiyCreditPage />}
                              />
                              <Route
                                path="/creditops"
                                element={<CreditOpsPage />}
                              />
                              <Route
                                path="/fundingops"
                                element={<FundingOpsPage />}
                              />
                              <Route
                                path="/full-suite"
                                element={<FullSuitePage />}
                              />
                              <Route path="/crm" element={<CrmPage />} />

                              {/* SEO keyword pages */}
                              <Route
                                path="/credit-repair-software"
                                element={<CreditRepairSoftwarePage />}
                              />
                              <Route
                                path="/funding-operations-software"
                                element={<FundingOperationsSoftwarePage />}
                              />
                              <Route
                                path="/credit-repair-business-software"
                                element={<CreditRepairBusinessSoftwarePage />}
                              />
                              <Route
                                path="/business-funding-software"
                                element={<BusinessFundingSoftwarePage />}
                              />
                              <Route
                                path="/credit-repair-and-funding-software"
                                element={<CreditRepairAndFundingSoftwarePage />}
                              />
                              <Route
                                path="/integrations"
                                element={<IntegrationsPage />}
                              />

                              <Route
                                path="/app"
                                element={
                                  <RequireAuth>
                                    <DashboardLayout />
                                  </RequireAuth>
                                }
                              >
                                <Route index element={<Dashboard />} />
                                <Route path="org/:orgPublicId" element={<OrganizationDashboard />} />
                                {/* HQ */}
                                <Route
                                  path="subaccounts"
                                  element={
                                    <RequireAgencyStaff label="Organizations">
                                      <SubAccountsManager />
                                    </RequireAgencyStaff>
                                  }
                                />
                                <Route
                                  path="attention"
                                  element={
                                    <RequireAgencyStaff label="Attention Center">
                                      <AttentionCenter />
                                    </RequireAgencyStaff>
                                  }
                                />
                                {/* My Work */}
                                <Route
                                  path="my-work"
                                  element={<MyWorkPage />}
                                />
                                <Route
                                  path="my-time"
                                  element={<MyTimePage />}
                                />
                                <Route path="eod" element={<EodPage />} />
                                <Route
                                  path="workspaces"
                                  element={
                                    <RequireEntitlement
                                      product="workspaces"
                                      label="Custom Workspaces"
                                    >
                                      <Workspaces />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="notifications"
                                  element={
                                    <RequireAgencyStaff label="Notifications">
                                      <NotificationsPage />
                                    </RequireAgencyStaff>
                                  }
                                />
                                {/* Managed Operations */}
                                <Route
                                  path="creditops"
                                  element={
                                    <RequireEntitlement
                                      product="creditOps"
                                      label="CreditOps"
                                    >
                                      <CreditOps />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="fundingops"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOps />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="bes-crm"
                                  element={
                                    <RequireEntitlement
                                      product="crm"
                                      label="BES CRM"
                                    >
                                      <BesCrm />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="talentops"
                                  element={<TalentOps />}
                                />
                                {/* Workforce */}
                                <Route
                                  path="people"
                                  element={
                                    <HubOrAgencyPage
                                      module="people"
                                      label="People"
                                      agency={<RequireAgencyStaff label="People"><PeoplePage /></RequireAgencyStaff>}
                                      organization={<CompanyPeople />}
                                    />
                                  }
                                />
                                <Route
                                  path="teams"
                                  element={
                                    <HubOrAgencyPage
                                      module="departments"
                                      label="Departments"
                                      agency={<RequireAgencyStaff label="Teams"><TeamsPage /></RequireAgencyStaff>}
                                      organization={<CompanyDepartments />}
                                    />
                                  }
                                />
                                <Route
                                  path="workforce"
                                  element={
                                    <RequireAgencyStaff label="Workforce">
                                      <WorkforcePage />
                                    </RequireAgencyStaff>
                                  }
                                />
                                {/* Management */}
                                <Route
                                  path="reporting"
                                  element={<RequirePermission permission="reports.view" label="Reports"><Reporting /></RequirePermission>}
                                />
                                <Route
                                  path="billing"
                                  element={
                                    <RequireAgencyStaff label="Billing & Revenue">
                                      <BillingPage />
                                    </RequireAgencyStaff>
                                  }
                                />
                                <Route
                                  path="compliance"
                                  element={<Compliance />}
                                />
                                {/* Company */}
                                <Route
                                  path="education"
                                  element={<Education />}
                                />
                                <Route
                                  path="announcements"
                                  element={<RequireHubModule module="announcements" label="Announcements"><AnnouncementsPage /></RequireHubModule>}
                                />
                                <Route
                                  path="calendar"
                                  element={<RequireHubModule module="calendar" label="Calendar"><CalendarPage /></RequireHubModule>}
                                />
                                {/* System */}
                                <Route path="settings" element={<RequirePermission permission={["settings.manage", "team.manage", "team.permissions", "billing.view", "creditops.letters.templates"]} label="Settings"><Settings /></RequirePermission>} />
                                <Route
                                  path="files"
                                  element={<RequireHubModule module="files" label="Files"><CompanyFiles /></RequireHubModule>}
                                />
                                <Route
                                  path="tools"
                                  element={<RequireHubModule module="tools" label="Tools"><CompanyTools /></RequireHubModule>}
                                />
                                <Route
                                  path="support"
                                  element={<SupportPage />}
                                />
                                {/* Legacy / shared */}
                                <Route
                                  path="fulfillment"
                                  element={<FulfillmentWorkspace />}
                                />
                                <Route
                                  path="diy-management"
                                  element={
                                    <RequireEntitlement
                                      product="diyCredit"
                                      label="DIY Credit"
                                    >
                                      <DiyNotBuilt />
                                    </RequireEntitlement>
                                  }
                                />
                                {/* CreditOps engine dashboard: action queues over live dispute data. */}
                                <Route
                                  path="dispute-dashboard"
                                  element={
                                    <RequireEntitlement
                                      product="creditOps"
                                      label="CreditOps"
                                    >
                                      <RequirePermission permission="creditops.clients.view" label="The CreditOps dashboard"><DisputeDashboard /></RequirePermission>
                                    </RequireEntitlement>
                                  }
                                />
                                {/* No permission key: the database returns
                                    only the channels this person is in. */}
                                <Route path="channels" element={<Channels />} />
                                <Route path="commissions" element={<RequirePermission permission="fundingops.commissions.view" label="Commissions"><Commissions /></RequirePermission>} />
                                {/*
                                  CLIENTS IS ORGANIZATION-LEVEL.

                                  Either service's key opens the directory,
                                  because the client list is the relationship
                                  layer under both — a FundingOps-only
                                  organization has no CreditOps key at all and
                                  must still be able to see its own customers.

                                  The credit-repair application moved to
                                  /app/creditops/cases/:id, where it keeps the
                                  CreditOps key it always had. Opening a client
                                  no longer opens a dispute screen.
                                */}
                                <Route path="clients" element={<RequirePermission permission={["creditops.clients.view", "fundingops.files.view"]} label="Clients"><Clients /></RequirePermission>} />
                                <Route
                                  path="clients/:id"
                                  element={<RequirePermission permission={["creditops.clients.view", "fundingops.files.view"]} label="Clients"><ClientProfile /></RequirePermission>}
                                />
                                <Route path="creditops/cases" element={<RequirePermission permission="creditops.clients.view" label="Credit Cases"><CreditCases /></RequirePermission>} />
                                <Route
                                  path="creditops/cases/:id"
                                  element={<RequirePermission permission="creditops.clients.view" label="Credit Cases"><ClientDetail /></RequirePermission>}
                                />
                                <Route
                                  path="operations"
                                  element={
                                    <RequireEntitlement
                                      product="creditOps"
                                      label="CreditOps"
                                    >
                                      <OrganizationCreditOps />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="metro2"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <OrganizationFundingOps />
                                    </RequireEntitlement>
                                  }
                                />
                                {/* FundingOps engine surfaces (Funding Files), separate from the Workspace. */}
                                <Route
                                  path="funding-files"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOpsAccessProvider>
                                        <RequirePermission permission="fundingops.files.view" label="Funding Files"><FundingFiles /></RequirePermission>
                                      </FundingOpsAccessProvider>
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="funding-dashboard"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOpsAccessProvider>
                                        <RequirePermission permission="fundingops.files.view" label="The FundingOps dashboard"><FundingDashboard /></RequirePermission>
                                      </FundingOpsAccessProvider>
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="lenders"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOpsAccessProvider>
                                        <RequirePermission permission="fundingops.files.view" label="Lenders"><Lenders /></RequirePermission>
                                      </FundingOpsAccessProvider>
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="funding-deals"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOpsAccessProvider>
                                        <RequirePermission permission="fundingops.files.view" label="Deals"><FundingDeals /></RequirePermission>
                                      </FundingOpsAccessProvider>
                                    </RequireEntitlement>
                                  }
                                />
                                <Route
                                  path="funding-files/:fileId"
                                  element={
                                    <RequireEntitlement
                                      product="fundingOps"
                                      label="FundingOps"
                                    >
                                      <FundingOpsAccessProvider>
                                        <RequirePermission permission="fundingops.files.view" label="Funding Files"><FundingFileDetail /></RequirePermission>
                                      </FundingOpsAccessProvider>
                                    </RequireEntitlement>
                                  }
                                />
                              </Route>
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Suspense>
                        </CrmAutomationProvider>
                      </ConnectorsProvider>
                    </AgreementsProvider>
                  </AgencySettingsProvider>
                </MonitoringStatusProvider>
              </AgencyProvider>
            </RoleProvider>
          </ReferralProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
