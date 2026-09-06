import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchFulfillmentClients } from "@/lib/data/fulfillment-clients";
import { ClientCreditReportSection } from "@/components/dashboard/fulfillment/ClientCreditReportSection";
import { ReportChangesPanel } from "@/components/clients/ReportChangesPanel";
import { ReportIntegrityPanel } from "@/components/clients/ReportIntegrityPanel";
import { RoundOutcomesPanel } from "@/components/clients/RoundOutcomesPanel";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import OverviewTab from "@/components/clients/OverviewTab";
import AccountTab from "@/components/clients/AccountTab";
import { ImportAnalysisTab } from "@/components/clients/ImportAnalysisTab";
import { DisputeDashboard } from "@/components/clients/DisputeDashboard";
import LettersTab from "@/components/clients/LettersTab";
import PrintTab from "@/components/clients/PrintTab";
import NextStepsTab from "@/components/clients/NextStepsTab";
import BuildCreditTab from "@/components/clients/BuildCreditTab";
import ScoreSimulator from "@/components/clients/ScoreSimulator";
import {
  useMonitoringStatus,
  statusLabel,
  type MonitoringStatus,
} from "@/lib/monitoring-status";
import {
  ClientWorkspaceProvider,
  useClientWorkspace,
  type ClientTab,
} from "@/lib/client-workspace-context";

const tabs: { key: ClientTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "account", label: "Client Info" },
  { key: "import", label: "Import & Analysis" },
  { key: "disputes", label: "Dispute Dashboard" },
  { key: "letters", label: "Letter Builder" },
  { key: "print", label: "Print & Download" },
  { key: "next-steps", label: "Next Steps" },
  { key: "build", label: "Build Credit" },
  { key: "simulator", label: "Score Simulator" },
];

const trackerSteps = [
  { label: "Import", done: true },
  { label: "Choose disputes", done: true },
  { label: "Build letters", current: true },
  { label: "Send", done: false },
  { label: "Update round", done: false },
];

const monitoringTone: Record<MonitoringStatus, string> = {
  connected: "bg-emerald-500/10 text-status-success",
  "monitoring-issue": "bg-red-500/10 text-status-danger",
  "needs-review": "bg-amber-500/10 text-status-warning",
};

const ClientDetailInner = () => {
  const params = useParams();
  const clientId = params.id ?? "1";
  const { reportSource } = useClientWorkspace();
  /* Live: the real client behind this profile, from the same RLS-scoped query
     the Workspace uses. Sample ids ("1") never hit the database. */
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId);
  const clientsQuery = useQuery({ queryKey: ["creditops", "clients"], queryFn: fetchFulfillmentClients, enabled: live && isUuid, staleTime: 15_000 });
  const liveClient = live && isUuid ? (clientsQuery.data ?? []).find((c) => c.id === clientId) ?? null : null;
  const displayName = liveClient?.name ?? (live ? "Client" : "Maria Gonzalez");
  const displayEmail = liveClient?.email ?? (live ? "" : "maria.g@email.com");
  const initials = displayName.replace(/^\[TEST\]\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "CL";
  const { tab, setTab, round } = useClientWorkspace();
  const { getState, setManualStatus } = useMonitoringStatus();
  const monitoring = getState(clientId);

  const handleReImport = () => setTab("import");

  return (
    <div className="p-6 md:p-8">
      {/* Rule 12: say where the items came from. Sample = demo content; none =
          a live client with nothing imported yet; live = the client's report. */}
      {reportSource === "sample" && (
        <div role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-foreground">
          <strong className="font-bold">Sample client and sample credit report.</strong>{" "}
          This workspace demonstrates the CreditOps analysis on bundled sample data; figures here are not any
          person's credit information.
        </div>
      )}
      {reportSource === "none" && (
        <div role="status" className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-foreground">
          <strong className="font-bold">No credit report imported yet.</strong>{" "}
          Import this client's report from <span className="font-semibold">Import &amp; Analysis</span> to unlock the analysis, the
          integrity checks, letter building on real items and the simulator. Nothing on this profile is estimated without it.
        </div>
      )}
      <Link
        to="/app/clients"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-emerald text-lg font-semibold text-white">
            {initials}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {displayName}
              </h1>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-status-success">
                {liveClient ? `${liveClient.status} · ${liveClient.round}` : `Active · Round ${round}`}
              </span>
              {!live && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${monitoringTone[monitoring.status]}`}
                  >
                    {monitoring.status === "monitoring-issue" && (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {statusLabel(monitoring.status)}
                    {monitoring.attempts > 0 && (
                      <span className="rounded-full bg-black/10 px-1.5 text-[10px]">
                        {monitoring.attempts} attempt
                        {monitoring.attempts === 1 ? "" : "s"}
                      </span>
                    )}
                    {monitoring.manuallySet && (
                      <Pencil className="h-2.5 w-2.5 opacity-60" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => setManualStatus(clientId, "connected")}
                  >
                    Mark as Connected
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setManualStatus(clientId, "monitoring-issue")
                    }
                  >
                    Mark as Monitoring Issue
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setManualStatus(clientId, "needs-review")}
                  >
                    Mark as Needs Review
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {live
                ? displayEmail || (clientsQuery.isLoading ? "Loading client…" : "Client not found or not visible to you.")
                : `maria.g@email.com · Next import in 30 days${monitoring.lastReason && monitoring.status === "monitoring-issue" ? ` · Last error: ${monitoring.lastReason}` : ""}`}
            </p>
          </div>
        </div>
        <Button
          onClick={handleReImport}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" /> {live ? "Import credit report" : "Re-import credit report"}
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center">
          {trackerSteps.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    s.done
                      ? "bg-gradient-emerald text-white"
                      : s.current
                        ? "border-2 border-emerald-500 text-status-success"
                        : "border border-border text-muted-foreground"
                  }`}
                >
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : s.current ? (
                    i + 1
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                </div>
                <span
                  className={`whitespace-nowrap text-[11px] font-medium ${
                    s.current ? "text-status-success" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < trackerSteps.length - 1 && (
                <div
                  className={`mx-1 mb-4 h-0.5 flex-1 ${
                    s.done ? "bg-emerald-500" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-gradient-emerald text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "account" && <AccountTab />}
      {tab === "import" &&
        (liveClient ? (
          <div className="space-y-4">
            <ClientCreditReportSection
              clientId={clientId}
              organizationId={liveClient.organizationId ?? null}
              outsourcingGroupId={liveClient.outsourcingGroupId ?? null}
            />
            <ReportChangesPanel clientId={clientId} />
            <ReportIntegrityPanel clientId={clientId} />
            <RoundOutcomesPanel clientId={clientId} />
          </div>
        ) : (
          <ImportAnalysisTab clientId={clientId} />
        ))}
      {tab === "disputes" && <DisputeDashboard />}
      {tab === "letters" && <LettersTab liveClientId={liveClient?.id ?? null} liveClientName={liveClient?.name ?? null} />}
      {tab === "print" && <PrintTab />}
      {tab === "next-steps" && <NextStepsTab />}
      {tab === "build" && <BuildCreditTab />}
      {tab === "simulator" && <ScoreSimulator />}
    </div>
  );
};

const ClientDetail = () => {
  const params = useParams();
  const clientId = params.id ?? "1";
  return (
    <ClientWorkspaceProvider clientId={clientId}>
      <ClientDetailInner />
    </ClientWorkspaceProvider>
  );
};

export default ClientDetail;
