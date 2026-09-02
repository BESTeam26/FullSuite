/**
 * CreditOps Webhook Panel — manage external CRM webhook endpoints and view the
 * live signal log of status changes pushed to external systems (GHL, DisputeFox,
 * generic).
 */

import { useState } from "react";
import { Plus, Trash2, Webhook, Zap, Radio } from "lucide-react";
import { useCreditOpsWebhooks } from "@/lib/fulfillment/creditops-webhooks";
import { cn } from "@/lib/utils";

export function CreditOpsWebhookPanel() {
  const {
    endpoints,
    signalLog,
    addEndpoint,
    updateEndpoint,
    removeEndpoint,
    toggleEndpoint,
    clearLog,
  } = useCreditOpsWebhooks();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"ghl" | "disputefox" | "generic">(
    "generic",
  );
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    addEndpoint({
      name: newName.trim(),
      type: newType,
      url: newUrl.trim(),
      apiKey: newKey.trim(),
      enabled: true,
    });
    setNewName("");
    setNewUrl("");
    setNewKey("");
    setNewType("generic");
    setShowAdd(false);
  };

  return (
    <div className="space-y-5 text-xs text-foreground">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <span className="font-bold uppercase tracking-wide text-foreground">
            🔗 EXTERNAL CRM WEBHOOKS
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
            {endpoints.filter((e) => e.enabled).length} active
          </span>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Endpoint
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase text-foreground">
            New Webhook Endpoint
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="GHL — CreditOps Pipeline"
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                Type
              </label>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as "ghl" | "disputefox" | "generic")
                }
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ghl">GHL</option>
                <option value="disputefox">DisputeFox</option>
                <option value="generic">Generic Webhook</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                Webhook URL
              </label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                API Key (optional)
              </label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Bearer token"
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              Add Endpoint
            </button>
          </div>
        </div>
      )}

      {/* Endpoints list */}
      <div className="space-y-3">
        {endpoints.map((ep) => (
          <div
            key={ep.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    ep.type === "ghl"
                      ? "bg-blue-500/10 text-blue-600"
                      : ep.type === "disputefox"
                        ? "bg-purple-500/10 text-purple-600"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{ep.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ep.url || "No URL set"} ·{" "}
                    {ep.lastFiredAt
                      ? `Last fired ${ep.lastFiredAt}`
                      : "Never fired"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleEndpoint(ep.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold",
                    ep.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                      : "border-border bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "relative inline-flex h-3.5 w-6 shrink-0 rounded-full border-2 border-transparent transition-colors",
                      ep.enabled ? "bg-emerald-600" : "bg-muted-foreground/40",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition",
                        ep.enabled ? "translate-x-2.5" : "translate-x-0",
                      )}
                    />
                  </span>
                  {ep.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  onClick={() => removeEndpoint(ep.id)}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  Webhook URL
                </label>
                <input
                  value={ep.url}
                  onChange={(e) =>
                    updateEndpoint(ep.id, { url: e.target.value })
                  }
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-border bg-background p-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground">
                  API Key
                </label>
                <input
                  value={ep.apiKey}
                  onChange={(e) =>
                    updateEndpoint(ep.id, { apiKey: e.target.value })
                  }
                  placeholder="Bearer token"
                  className="mt-1 w-full rounded-lg border border-border bg-background p-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  Signals Fired
                </p>
                <p className="mt-0.5 text-lg font-black text-foreground">
                  {ep.fires}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  Status
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm font-bold",
                    ep.enabled ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {ep.enabled ? "Active" : "Inactive"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Signal Log */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground">
            <Radio className="h-3.5 w-3.5 text-primary" /> LIVE SIGNAL LOG
          </span>
          <button
            onClick={clearLog}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Clear log
          </button>
        </div>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {signalLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No signals emitted yet. Status changes in queue views will push to
              connected external CRMs here.
            </p>
          ) : (
            signalLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      entry.status === "emitted"
                        ? "bg-emerald-500/10 text-emerald-700"
                        : entry.status === "failed"
                          ? "bg-red-500/10 text-red-700"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.status.toUpperCase()}
                  </span>
                  <span className="font-semibold text-foreground">
                    {entry.clientName}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.previousStatus} → {entry.newStatus}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{entry.endpointName}</span>
                  <span>{entry.at}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
