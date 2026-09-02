import { useState } from "react";
import {
  Radio,
  PlugZap,
  Webhook,
  Tag,
  GitBranch,
  ListChecks,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useCrmAutomation,
  EVENT_LABELS,
  EVENT_GROUPS,
  type InternalEventKey,
} from "@/lib/crm-automation-context";

const statusTone: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  disconnected: "bg-muted text-muted-foreground border-border",
  error: "bg-red-500/10 text-red-600 border-red-500/30",
};

const logTone: Record<string, string> = {
  emitted: "text-emerald-600",
  skipped: "text-amber-600",
  failed: "text-red-600",
};

export const CrmAutomationManager = () => {
  const {
    connection,
    mappings,
    log,
    setConnection,
    connect,
    disconnect,
    updateMapping,
    toggleMapping,
    emit,
    clearLog,
  } = useCrmAutomation();

  const [url, setUrl] = useState(connection.webhookUrl);
  const [key, setKey] = useState(connection.apiKey);
  const [loc, setLoc] = useState(connection.locationId);
  const [pipe, setPipe] = useState(connection.pipelineId);
  const [testing, setTesting] = useState(false);

  const handleConnect = () => {
    setTesting(true);
    setTimeout(() => {
      connect({
        webhookUrl: url,
        apiKey: key,
        locationId: loc,
        pipelineId: pipe,
      });
      setTesting(false);
    }, 900);
  };

  const fireTest = () => {
    emit("dispute.round_mailed", {
      clientId: "TEST-001",
      clientName: "Test Signal",
      subAccountId: "HQ",
    });
  };

  return (
    <div className="space-y-6">
      {/* Connection card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Radio className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">CRM automation bridge</h2>
                <Badge className={statusTone[connection.status]}>
                  {connection.status}
                </Badge>
              </div>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                This fulfillment platform never sends SMS, email, or marketing
                messages. It emits structured outbound signals to your connected
                front-office CRM, which owns pipeline stage moves, tags,
                workflow triggers, and contact sync.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection.status === "connected" ? (
              <>
                <Button size="sm" variant="outline" onClick={fireTest}>
                  <Send className="h-3.5 w-3.5" /> Test signal
                </Button>
                <Button size="sm" variant="outline" onClick={disconnect}>
                  <Power className="h-3.5 w-3.5" /> Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="bg-gradient-emerald text-white hover:opacity-90"
                onClick={handleConnect}
                disabled={!url || testing}
              >
                <PlugZap className="h-3.5 w-3.5" />
                {testing ? "Verifying…" : "Connect CRM"}
              </Button>
            )}
          </div>
        </div>

        {connection.status === "connected" && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Location ID" value={connection.locationId || "—"} />
            <Stat label="Pipeline" value={connection.pipelineId || "—"} />
            <Stat
              label="Signals emitted"
              value={connection.signalsEmitted.toString()}
            />
            <Stat label="Last signal" value={connection.lastSignalAt ?? "—"} />
          </div>
        )}

        {connection.status !== "connected" && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">
                Webhook URL (inbound to CRM)
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://crm.example.com/api/webhooks/inbound"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                API key / bearer token
              </Label>
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="paste-token"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                CRM location ID
              </Label>
              <Input
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                placeholder="loc_xxxxxxxx"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Default pipeline ID
              </Label>
              <Input
                value={pipe}
                onChange={(e) => setPipe(e.target.value)}
                placeholder="pipe_xxxxxxxx"
                className="mt-1.5"
              />
            </div>
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Credentials are stored encrypted in the secrets vault. The bridge
              only emits signals — it cannot read your CRM contacts or send
              messages on your behalf.
            </div>
          </div>
        )}
      </div>

      {/* Event mapping table */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold">Event mapping</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Map each internal fulfillment event to a CRM pipeline stage, contact
          tag, and workflow trigger. Disabled events are recorded in the audit
          log but not emitted.
        </p>

        <div className="mt-5 space-y-6">
          {EVENT_GROUPS.map((group) => {
            const groupMappings = mappings.filter(
              (m) => EVENT_LABELS[m.event as InternalEventKey]?.group === group,
            );
            if (!groupMappings.length) return null;
            return (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Event</th>
                        <th className="px-4 py-2 font-medium">
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" /> Pipeline stage
                          </span>
                        </th>
                        <th className="px-4 py-2 font-medium">
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" /> Tag
                          </span>
                        </th>
                        <th className="px-4 py-2 font-medium">
                          <span className="flex items-center gap-1">
                            <Webhook className="h-3 w-3" /> Workflow trigger
                          </span>
                        </th>
                        <th className="w-16 px-4 py-2 text-right font-medium">
                          Emit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {groupMappings.map((m) => {
                        const meta = EVENT_LABELS[m.event as InternalEventKey];
                        return (
                          <tr key={m.event} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">
                                {meta?.label}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {meta?.description}
                              </p>
                              <p className="mt-1 font-mono text-[10px] text-emerald-600">
                                {m.event}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                value={m.pipelineStage}
                                onChange={(e) =>
                                  updateMapping(m.event as InternalEventKey, {
                                    pipelineStage: e.target.value,
                                  })
                                }
                                placeholder="e.g. Dispute Round 1"
                                className="h-8 text-xs"
                                disabled={!m.enabled}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                value={m.tag}
                                onChange={(e) =>
                                  updateMapping(m.event as InternalEventKey, {
                                    tag: e.target.value,
                                  })
                                }
                                placeholder="e.g. round-1-mailed"
                                className="h-8 text-xs"
                                disabled={!m.enabled}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                value={m.workflowTrigger}
                                onChange={(e) =>
                                  updateMapping(m.event as InternalEventKey, {
                                    workflowTrigger: e.target.value,
                                  })
                                }
                                placeholder="e.g. wf_dispute_mailed"
                                className="h-8 text-xs"
                                disabled={!m.enabled}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Switch
                                checked={m.enabled}
                                onCheckedChange={() =>
                                  toggleMapping(m.event as InternalEventKey)
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live signal log */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Signal log</h2>
            <Badge variant="outline" className="text-xs">
              {log.length} {log.length === 1 ? "entry" : "entries"}
            </Badge>
          </div>
          {log.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearLog}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Auditable record of every outbound signal — emitted, skipped, or
          failed. Each entry shows exactly what would be posted to your CRM.
        </p>

        {log.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Webhook className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No signals emitted yet. Status changes will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-left text-[10px] uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Sub-acct</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {log.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.at}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[10px] text-emerald-600">
                        {entry.event}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {entry.clientName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.subAccountId}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.crmStage}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.crmTag}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`flex items-center gap-1 ${logTone[entry.status]}`}
                      >
                        {entry.status === "emitted" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-muted/20 p-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="mt-0.5 text-sm font-semibold truncate">{value}</p>
  </div>
);
