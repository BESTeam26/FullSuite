import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import { AuthLandingRedirect } from "@/components/auth/AuthLandingRedirect";
import { RequireEntitlement } from "./components/auth/RequireEntitlement";
import { RequirePermission } from "./components/auth/RequirePermission";
import { RequireHubModule } from "./components/auth/RequireHubModule";
import { HubOrAgencyPage } from "./components/auth/HubOrAgencyPage";
import { FundingOpsAccessProvider } from "@/lib/fulfillment/fundingops-access";
import { useRouteTransition, ShownLocationContext } from "@/lib/nav/use-route-transition";
import { RouteProgress } from "@/components/dashboard/RouteProgress";
import { WorkspaceSkeleton } from "@/components/dashboard/WorkspaceSkeleton";
import { chunkFor, named } from "@/lib/nav/route-chunks";

/* ------------------------------------------------------------------ */
/* Route-level code splitting                                          */
/* Marketing, portals, and the /app workspace load as separate chunks. */
/* ------------------------------------------------------------------ */

// Auth
const Login = lazy(() => import("./pages/auth/Login"));
const AcceptInvitation = lazy(() => import("./pages/auth/AcceptInvitation"));
const SignDocumentPage = lazy(() => import("./pages/sign/SignDocumentPage"));
const SignUp = lazy(() => import("./pages/auth/SignUp"));
const BorrowerPortal = lazy(() => import("./pages/portals/BorrowerPortal"));
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback"));

// Public / marketing
const Index = lazy(() => import("./pages/Index"));
const ClientPortal = lazy(() => import("./pages/portal/ClientPortal"));
const Channels = lazy(chunkFor("/app/channels"));
const Commissions = lazy(chunkFor("/app/commissions"));
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
const Dashboard = lazy(chunkFor("/app"));
const AccessPreviewPage = lazy(chunkFor("/app/access-preview"));
const Workspaces = lazy(chunkFor("/app/workspaces"));
const OrganizationDashboard = lazy(chunkFor("/app/org/:orgPublicId"));
const Clients = lazy(chunkFor("/app/clients"));
const ClientProfile = lazy(chunkFor("/app/clients/:id"));
const CreditCases = lazy(chunkFor("/app/creditops/cases"));
const BesPartners = lazy(chunkFor("/app/bes-partners"));
const FundingDealDetail = lazy(chunkFor("/app/funding-deals/:dealId"));
const DiyReferrals = lazy(chunkFor("/app/diy-referrals"));
const ClientDetail = lazy(chunkFor("/app/creditops/cases/:id"));
const FundingFiles = lazy(chunkFor("/app/funding-files"));
const FundingFileDetail = lazy(chunkFor("/app/funding-files/:fileId"));
const Lenders = lazy(chunkFor("/app/lenders"));
const FundingDashboard = lazy(chunkFor("/app/funding-dashboard"));
const DisputeDashboard = lazy(chunkFor("/app/dispute-dashboard"));
const FundingDeals = lazy(chunkFor("/app/funding-deals"));
const Compliance = lazy(chunkFor("/app/compliance"));
const OrganizationCreditOps = lazy(chunkFor("/app/operations"));
const OrganizationFundingOps = lazy(chunkFor("/app/funding-workspace"));
const Reporting = lazy(chunkFor("/app/reporting"));
const Education = lazy(chunkFor("/app/education"));
const Settings = lazy(chunkFor("/app/settings"));

const CreditOps = lazy(chunkFor("/app/creditops"));
const FundingOps = lazy(chunkFor("/app/fundingops"));
const BesCrm = lazy(chunkFor("/app/bes-crm"));
const TalentOps = lazy(chunkFor("/app/talentops"));
const SubAccountsManager = lazy(chunkFor("/app/subaccounts"));

const AttentionCenter = lazy(chunkFor("/app/attention"));
const MyWorkPage = lazy(chunkFor("/app/my-work"));
// Time and EOD now load real data, so they live in their own modules and
// lazy-load independently of the other HQ pages.
const MyTimePage = lazy(chunkFor("/app/my-time"));
const EodPage = lazy(chunkFor("/app/eod"));
const AgencyOrOrgCalendar = lazy(chunkFor("/app/calendar"));
const PartnerProfilePage = lazy(chunkFor("/app/bes-partners/:id"));
const PartnerPortal = lazy(named(() => import("./pages/portal/PartnerPortal"), "PartnerPortal"));
const TeamEodPage = lazy(chunkFor("/app/team-eod"));
const AgencyTeamWorkspace = lazy(chunkFor("/app/team-workspace"));
const NotificationsPage = lazy(chunkFor("/app/notifications"));
const PeoplePage = lazy(chunkFor("/app/people"));
const TeamMemberProfilePage = lazy(chunkFor("/app/people/:userId"));
const TeamsPage = lazy(chunkFor("/app/teams"));
const BillingPage = lazy(chunkFor("/app/billing"));
const AgencyFinance = lazy(chunkFor("/app/finance"));
const AnnouncementsPage = lazy(chunkFor("/app/announcements"));
/* The organization-side halves of /app/people and /app/teams. They share a
   route with the agency pages and `HubOrAgencyPage` picks between them, so
   they are not in the chunk registry — which is keyed by path, and a path has
   one entry. The agency screen is the one worth warming from the menu. */
const CompanyPeople = lazy(() => import("./pages/app/CompanyPeople"));
const CompanyDepartments = lazy(() => import("./pages/app/CompanyDepartments"));
const CompanyTools = lazy(chunkFor("/app/tools"));
const CompanyFiles = lazy(chunkFor("/app/files"));
const SupportPage = lazy(chunkFor("/app/support"));

/**
 * Cache deliberately, not accidentally (rule 14).
 *
 * The defaults were React Query's own, which mean: every query is stale the
 * moment it resolves, every mount refetches, and every time the window regains
 * focus EVERY active query refetches at once. On a screen holding ten queries
 * at a couple of hundred milliseconds each, alt-tabbing back to the browser
 * cost a visible stall — Dee, 2026-09-09: "the app is becoming super slow".
 *
 * The app already invalidates precisely after every mutation, so focus
 * refetching adds load without adding truth. A short baseline staleTime keeps
 * a navigation back to a screen instant while still refreshing a screen left
 * open; hooks that need fresher or staler data still say so themselves.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      /* Three retries with backoff turned one refused request into seconds of
         apparent hang. One retry covers a dropped connection; a real refusal
         should surface immediately. */
      retry: 1,
    },
  },
});

/* The placeholder for the very first screen of a session, before any chunk
   has arrived. On a workspace URL it is the same frame the boot HTML painted
   and the same one `RequireAuth` holds, so a cold load never changes shape —
   it only fills in. Elsewhere it is page-shaped, matching the marketing and
   portal pages it stands in for (rule 15: loading preserves layout).

   Tab switches do not reach this. `useRouteTransition` keeps the screen you
   were on until the next one is ready, so there is nothing to stand in for. */
const RouteFallback = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/app")) return <WorkspaceSkeleton />;
  return (
    <div className="animate-pulse p-6 md:p-8" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-7 w-56 rounded-lg bg-muted" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl border border-border bg-card" />)}
      </div>
      <div className="h-64 rounded-xl border border-border bg-card" />
    </div>
  );
};

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
                          <AppRoutes />
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


/**
 * Every route in the product, rendered against the location the shell has
 * finished loading rather than the one the address bar already shows.
 *
 * Its own component because `useRouteTransition` needs to be inside the
 * router, and because the route table had grown long enough that reading
 * `App` meant scrolling past five hundred lines of it to reach the providers.
 */
const AppRoutes = () => {
  const { location, pending } = useRouteTransition();
  return (
    <ShownLocationContext.Provider value={location}>
      <RouteProgress active={pending} />
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route path="/" element={<AuthLandingRedirect><Index /></AuthLandingRedirect>} />
          <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
          <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
          <Route path="/sign/:token" element={<SignDocumentPage />} />
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
            path="/partner"
            element={
              <RequireAuth>
                <PartnerPortal />
              </RequireAuth>
            }
          />
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
                {/* The shell, always mounted. Every Agency
                    HQ route still passes through the same
                    authority the menu uses — the guard now
                    lives inside DashboardLayout, around the
                    Outlet, so a refusal or a page still
                    loading replaces the CONTENT and not the
                    navigation. It used to wrap this
                    element, which meant the sidebar and
                    topbar vanished for as long as a lazy
                    page chunk took to arrive. */}
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
              path="team-eod"
              element={
                <RequireAgencyStaff label="Team EOD">
                  <TeamEodPage />
                </RequireAgencyStaff>
              }
            />
            {/* The BES team's own workspace. Agency staff
                only — this is internal work, not a
                customer's (rule 16). */}
            <Route
              path="team-workspace"
              element={
                <RequireAgencyStaff label="Team Workspace">
                  <AgencyTeamWorkspace />
                </RequireAgencyStaff>
              }
            />
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
              path="people/:userId"
              element={
                <RequireAgencyStaff label="Team member">
                  <TeamMemberProfilePage />
                </RequireAgencyStaff>
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
            {/* Workforce and HR & People dissolved into People (Dee's People
                Hub doctrine): their facts live on as People → Workforce
                insights and the Team Member profile; payroll configuration
                went to Finance. Old bookmarks land where the facts went. */}
            <Route path="workforce" element={<Navigate to="/app/people?view=insights" replace />} />
            <Route path="hr" element={<Navigate to="/app/people?view=insights" replace />} />
            {/* Management */}
            <Route
              path="reporting"
              element={<RequirePermission permission="reports.view" label="Reports"><Reporting /></RequirePermission>}
            />
            {/* No guard here: DashboardLayout wraps every
                Agency HQ page in the shared route guard,
                which reads the path and refuses on the
                same spec the menu uses. */}
            <Route path="finance" element={<AgencyFinance />} />
            <Route
              path="billing"
              element={
                <RequireAgencyStaff label="Organization billing">
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
              /* Agency staff get the BES business
                 calendar — U.S. holidays and company
                 events. An organization member gets their
                 own hub calendar, gated as before. */
              element={<AgencyOrOrgCalendar />}
            />
            {/* System */}
            {/* The Access Inspector. Only meaningful during
                a preview, and it says so when there is
                none — a route that renders nothing is worse
                than one that explains why. */}
            <Route path="access-preview" element={<AccessPreviewPage />} />
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
            {/*
              BES PARTNERS — the companies BES is engaged
              to work for. Not end consumers (those are an
              organization's Clients) and not every SaaS
              subscriber. RequireAgency keeps it to BES
              staff; the engagement rows RLS returns decide
              what is actually on it.
            */}
            <Route path="diy-referrals" element={<RequireEntitlement product="diyCredit" label="DIY Credit"><DiyReferrals /></RequireEntitlement>} />
            <Route path="bes-partners" element={<RequireAgencyStaff label="BES Partners"><BesPartners /></RequireAgencyStaff>} />
            <Route path="bes-partners/:id" element={<RequireAgencyStaff label="Partner"><PartnerProfilePage /></RequireAgencyStaff>} />
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
              path="funding-workspace"
              element={
                <RequireEntitlement
                  product="fundingOps"
                  label="FundingOps"
                >
                  <OrganizationFundingOps />
                </RequireEntitlement>
              }
            />
            {/*
              This screen answered to /app/metro2 for most
              of the build. The destination was always
              right — it is the FundingOps Workspace — but
              Metro 2 is a credit-reporting format and has
              nothing to do with funding. The name was a
              leftover. Old links keep working.
            */}
            <Route path="metro2" element={<Navigate to="/app/funding-workspace" replace />} />
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
            {/* One deal — the domain record of taking a
                file to one lender. Distinct from the
                Workspace's operational working record. */}
            <Route
              path="funding-deals/:dealId"
              element={
                <RequireEntitlement product="fundingOps" label="FundingOps">
                  <RequirePermission permission="fundingops.files.view" label="Deals">
                    <FundingDealDetail />
                  </RequirePermission>
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
    </ShownLocationContext.Provider>
  );
};

export default App;
