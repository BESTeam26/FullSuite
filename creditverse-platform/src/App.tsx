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
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireAgencyStaff } from "@/components/auth/RequireAgencyStaff";
import { RequireEntitlement } from "./components/auth/RequireEntitlement";

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
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback"));

// Public / marketing
const Index = lazy(() => import("./pages/Index"));
const Portal = lazy(() => import("./pages/Portal"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DiyPortal = lazy(() => import("./pages/DiyPortal"));
const DiyConsumerPortal = lazy(() => import("./pages/DiyConsumerPortal"));
const AffiliatePortal = lazy(() => import("./pages/portals/AffiliatePortal"));
const OutsourcingPortal = lazy(
  () => import("./pages/portals/OutsourcingPortal"),
);
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
const ClientDetail = lazy(() => import("./pages/app/ClientDetail"));
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
const DiyManagement = lazy(() => import("./pages/app/DiyManagement"));
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
const SupportPage = lazy(named(hq2, "SupportPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
                              <Route path="/login" element={<Login />} />
                              <Route
                                path="/auth/callback"
                                element={<AuthCallback />}
                              />
                              <Route path="/portal" element={<Portal />} />
                              <Route path="/diy" element={<DiyPortal />} />
                              <Route
                                path="/diy-consumer"
                                element={<DiyConsumerPortal />}
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
                                    <RequireAgencyStaff label="People">
                                      <PeoplePage />
                                    </RequireAgencyStaff>
                                  }
                                />
                                <Route
                                  path="teams"
                                  element={
                                    <RequireAgencyStaff label="Teams">
                                      <TeamsPage />
                                    </RequireAgencyStaff>
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
                                  element={<Reporting />}
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
                                  element={<AnnouncementsPage />}
                                />
                                <Route
                                  path="calendar"
                                  element={<CalendarPage />}
                                />
                                {/* System */}
                                <Route path="settings" element={<Settings />} />
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
                                      <DiyManagement />
                                    </RequireEntitlement>
                                  }
                                />
                                <Route path="clients" element={<Clients />} />
                                <Route
                                  path="clients/:id"
                                  element={<ClientDetail />}
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
