import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Portal from "./pages/Portal";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RoleProvider } from "@/lib/role-context";
import { ReferralProvider } from "@/lib/referral/referral-context";
import { AgencyProvider } from "@/lib/agency-context";
import { MonitoringStatusProvider } from "@/lib/monitoring-status";
import { AgreementsProvider } from "@/lib/agreements-context";
import { ConnectorsProvider } from "@/lib/connectors-context";
import { CrmAutomationProvider } from "@/lib/crm-automation-context";
import { AgencySettingsProvider } from "@/lib/agency-settings-context";
import Dashboard from "./pages/app/Dashboard";
import Clients from "./pages/app/Clients";
import ClientDetail from "./pages/app/ClientDetail";
import Compliance from "./pages/app/Compliance";
import Operations from "./pages/app/Operations";
import Metro2 from "./pages/app/Metro2";
import Reporting from "./pages/app/Reporting";
import Education from "./pages/app/Education";
import Settings from "./pages/app/Settings";
import { SubAccountsManager } from "@/components/dashboard/SubAccountsManager";
import { FulfillmentWorkspace } from "@/components/dashboard/FulfillmentWorkspace";
import AffiliatePortal from "./pages/portals/AffiliatePortal";
import OutsourcingPortal from "./pages/portals/OutsourcingPortal";
import DiyPortal from "./pages/DiyPortal";
import DiyConsumerPortal from "./pages/DiyConsumerPortal";
import DiyManagement from "./pages/app/DiyManagement";
// Managed-service division pages
import CreditOps from "./pages/app/CreditOps";
import FundingOps from "./pages/app/FundingOps";
import BesCrm from "./pages/app/BesCrm";
import TalentOps from "./pages/app/TalentOps";
// HQ section pages
import {
  AttentionCenter,
  MyWorkPage,
  MyTimePage,
  EodPage,
  NotificationsPage,
} from "./pages/app/HqPages";
import {
  PeoplePage,
  TeamsPage,
  WorkforcePage,
  BillingPage,
  AnnouncementsPage,
  CalendarPage,
  SupportPage,
} from "./pages/app/HqPages2";
import DiyCreditPage from "./pages/products/DiyCreditPage";
import CreditOpsPage from "./pages/products/CreditOpsPage";
import FundingOpsPage from "./pages/products/FundingOpsPage";
import FullSuitePage from "./pages/products/FullSuitePage";
import CrmPage from "./pages/products/CrmPage";
import CreditRepairSoftwarePage from "./pages/seo/CreditRepairSoftwarePage";
import FundingOperationsSoftwarePage from "./pages/seo/FundingOperationsSoftwarePage";
import CreditRepairBusinessSoftwarePage from "./pages/seo/CreditRepairBusinessSoftwarePage";
import BusinessFundingSoftwarePage from "./pages/seo/BusinessFundingSoftwarePage";
import CreditRepairAndFundingSoftwarePage from "./pages/seo/CreditRepairAndFundingSoftwarePage";
import IntegrationsPage from "./pages/seo/IntegrationsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ReferralProvider>
        <RoleProvider>
          <AgencyProvider>
            <MonitoringStatusProvider>
              <AgencySettingsProvider>
                <BrowserRouter>
                  <AgreementsProvider>
                    <ConnectorsProvider>
                      <CrmAutomationProvider>
                        <Routes>
                          <Route path="/" element={<Index />} />
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

                          <Route path="/app" element={<DashboardLayout />}>
                            <Route index element={<Dashboard />} />
                            {/* HQ */}
                            <Route
                              path="subaccounts"
                              element={<SubAccountsManager />}
                            />
                            <Route
                              path="attention"
                              element={<AttentionCenter />}
                            />
                            {/* My Work */}
                            <Route path="my-work" element={<MyWorkPage />} />
                            <Route path="my-time" element={<MyTimePage />} />
                            <Route path="eod" element={<EodPage />} />
                            <Route
                              path="notifications"
                              element={<NotificationsPage />}
                            />
                            {/* Managed Operations */}
                            <Route path="creditops" element={<CreditOps />} />
                            <Route path="fundingops" element={<FundingOps />} />
                            <Route path="bes-crm" element={<BesCrm />} />
                            <Route path="talentops" element={<TalentOps />} />
                            {/* Workforce */}
                            <Route path="people" element={<PeoplePage />} />
                            <Route path="teams" element={<TeamsPage />} />
                            <Route
                              path="workforce"
                              element={<WorkforcePage />}
                            />
                            {/* Management */}
                            <Route path="reporting" element={<Reporting />} />
                            <Route path="billing" element={<BillingPage />} />
                            <Route path="compliance" element={<Compliance />} />
                            {/* Company */}
                            <Route path="education" element={<Education />} />
                            <Route
                              path="announcements"
                              element={<AnnouncementsPage />}
                            />
                            <Route path="calendar" element={<CalendarPage />} />
                            {/* System */}
                            <Route path="settings" element={<Settings />} />
                            <Route path="support" element={<SupportPage />} />
                            {/* Legacy / shared */}
                            <Route
                              path="fulfillment"
                              element={<FulfillmentWorkspace />}
                            />
                            <Route
                              path="diy-management"
                              element={<DiyManagement />}
                            />
                            <Route path="clients" element={<Clients />} />
                            <Route
                              path="clients/:id"
                              element={<ClientDetail />}
                            />
                            <Route path="operations" element={<Operations />} />
                            <Route path="metro2" element={<Metro2 />} />
                          </Route>
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </CrmAutomationProvider>
                    </ConnectorsProvider>
                  </AgreementsProvider>
                </BrowserRouter>
              </AgencySettingsProvider>
            </MonitoringStatusProvider>
          </AgencyProvider>
        </RoleProvider>
      </ReferralProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
