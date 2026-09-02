import { useState } from "react";
import {
  Plug,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
  Unlink,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useConnectors } from "@/lib/connectors-context";

const statusTone: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-600",
  pending: "bg-amber-500/10 text-amber-600",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-red-500/10 text-red-600",
};

export const ConnectorWizard = () => {
  const { providers, connections, connect, disconnect } = useConnectors();
  const [wizardProvider, setWizardProvider] = useState<string | null>(null);
  const [cred1, setCred1] = useState("");
  const [cred2, setCred2] = useState("");
  const [connecting, setConnecting] = useState(false);

  const openWizard = (providerId: string) => {
    setWizardProvider(providerId);
    setCred1("");
    setCred2("");
  };

  const providerDef = providers.find((p) => p.id === wizardProvider);

  const runConnect = () => {
    if (!wizardProvider || !cred1) return;
    setConnecting(true);
    setTimeout(() => {
      connect(
        wizardProvider,
        `${providerDef?.authLabel.split(" ")[0]}-••••${cred1.slice(-4)}`,
      );
      setConnecting(false);
      setWizardProvider(null);
    }, 1600);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-emerald-600" />
        <h2 className="font-semibold">Credit data connectors</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Direct API connectors for authorized report retrieval. Use partner
        keys/tokens — never password scraping. Configure in the wizard.
      </p>

      <div className="mt-4 space-y-3">
        {connections.map((c) => {
          const def = providers.find((p) => p.id === c.providerId)!;
          return (
            <div
              key={c.providerId}
              className="rounded-xl border border-border bg-muted/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusTone[c.status]}`}
                  >
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{c.providerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {def.authLabel} · {c.credentialLabel}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {c.status === "connected" && (
                        <>
                          <span>Connected {c.connectedAt}</span>
                          <span>· Last sync {c.lastSync}</span>
                          <span>
                            · {c.reportsPulled.toLocaleString()} reports
                          </span>
                        </>
                      )}
                      {c.status === "pending" && (
                        <span className="text-amber-600">
                          Credentials requested — not yet entered
                        </span>
                      )}
                      {c.status === "disconnected" && (
                        <span>Not connected</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusTone[c.status]}>{c.status}</Badge>
                  {c.status === "connected" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => disconnect(c.providerId)}
                    >
                      <Unlink className="h-3.5 w-3.5" /> Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-gradient-emerald text-white"
                      onClick={() => openWizard(c.providerId)}
                    >
                      <Link2 className="h-3.5 w-3.5" /> Connect
                    </Button>
                  )}
                </div>
              </div>
              {def.note && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-card p-2.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  {def.note}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Wizard modal */}
      {wizardProvider && providerDef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !connecting && setWizardProvider(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold">Connect {providerDef.name}</h3>
              </div>
              <button
                onClick={() => !connecting && setWizardProvider(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {providerDef.note}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {providerDef.authMethod === "client-token"
                    ? "Client Token"
                    : providerDef.authMethod === "client-key"
                      ? "Client Key"
                      : "Partner API Key"}
                </Label>
                <Input
                  value={cred1}
                  onChange={(e) => setCred1(e.target.value)}
                  placeholder="Paste credential"
                  className="mt-1"
                />
              </div>
              {providerDef.authMethod === "client-key" && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Client Secret
                  </Label>
                  <Input
                    type="password"
                    value={cred2}
                    onChange={(e) => setCred2(e.target.value)}
                    placeholder="Paste secret"
                    className="mt-1"
                  />
                </div>
              )}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-700">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                Credentials are stored encrypted in the secrets vault. Never
                exposed to processors or logged in plaintext.
              </div>
              <Button
                onClick={runConnect}
                disabled={!cred1 || connecting}
                className="w-full bg-gradient-emerald text-white hover:opacity-90"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying
                    connection…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Connect &amp; verify
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
