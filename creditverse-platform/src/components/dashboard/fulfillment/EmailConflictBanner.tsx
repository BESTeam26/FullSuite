/**
 * EmailConflictBanner — in-app warning helper for the ONE EMAIL = ONE FILE
 * PER PARTNER rule, used by the inline email edit in both the CreditOps and
 * FundingOps client list tables.
 *
 *   - Same email on THIS partner  → hard block (red), edit cannot be saved.
 *   - Same email on ANOTHER partner → warn (amber) + "Confirm separate
 *     enrollment" so the agent can decide & document (cancel & re-enroll /
 *     shopping both companies). Confirming logs the decision to Activity.
 *
 * Replaces the old native window.alert / window.confirm dialogs.
 */

import { ShieldAlert, AlertTriangle } from "lucide-react";
import {
  clientGroupLabel,
  type OpsClient,
} from "@/lib/fulfillment/ops-client-domain";
import { cn } from "@/lib/utils";

/**
 * Generic over the division's client type so CreditOps and FundingOps call
 * sites keep their own precise types while sharing one component. The banner
 * itself only ever reads fields that every ops client has.
 */
export interface EmailConflictState<T extends OpsClient = OpsClient> {
  clientId: string;
  value: string;
  sameScopeDuplicate?: T;
  crossScopeMatches: T[];
}

interface EmailConflictBannerProps {
  conflict: EmailConflictState;
  onDismiss: () => void;
  onConfirmCrossPartner: () => void;
}

export function EmailConflictBanner({
  conflict,
  onDismiss,
  onConfirmCrossPartner,
}: EmailConflictBannerProps) {
  const blocked = Boolean(conflict.sameScopeDuplicate);
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-xs",
        blocked
          ? "border-red-500/40 bg-red-500/10 text-red-700"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700",
      )}
    >
      <div className="flex items-start gap-2">
        {blocked ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="flex-1 space-y-2">
          {blocked ? (
            <div className="space-y-1">
              <p className="font-bold">
                Email blocked — duplicate on this partner
              </p>
              <p>
                <strong>{conflict.sameScopeDuplicate!.name}</strong> already
                uses <code>{conflict.value}</code> on this partner. One email =
                one file per partner — this edit cannot be saved.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-bold">
                This email exists on another partner's list
              </p>
              <div className="space-y-0.5">
                {conflict.crossScopeMatches.map((m) => (
                  <div key={m.id}>
                    {"• "}
                    <strong>{m.name}</strong> {" — "}
                    {clientGroupLabel(m)} {" · status: "}
                    {m.status}
                  </div>
                ))}
              </div>
              <p>
                This can happen when a client cancels with one company and
                re-enrolls with another, or shops both at once. Confirm only if
                this is a legitimate separate enrollment — the decision is
                logged to Activity.
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onDismiss}
              className="rounded-lg border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted"
            >
              Dismiss
            </button>
            {!blocked && (
              <button
                onClick={onConfirmCrossPartner}
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:opacity-90"
              >
                Confirm separate enrollment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
