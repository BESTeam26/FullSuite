/**
 * Add Client Modal — creates a manual client record.
 *
 * Enforces the ONE EMAIL = ONE FILE PER PARTNER rule:
 *  - Same email already on THIS partner → hard block, cannot add.
 *  - Same email on a DIFFERENT partner → warn + require explicit confirm
 *    (cancel & re-enroll / shopping both companies scenario).
 */

import { useState } from "react";
import { X, UserPlus, AlertTriangle, ShieldAlert } from "lucide-react";
import {
  useCreditOpsStore,
  ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/creditops-client-store";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";

interface AddClientModalProps {
  open: boolean;
  onClose: () => void;
  partner: CreditOpsPartner | undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+-]{7,}$/;

export function AddClientModal({
  open,
  onClose,
  partner,
}: AddClientModalProps) {
  const store = useCreditOpsStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] =
    useState<FulfillmentClient["status"]>("Onboarding");
  const [round, setRound] = useState<FulfillmentClient["round"]>("Pre-Round");
  const [assignee, setAssignee] = useState("Unassigned");
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Cross-partner matches awaiting explicit confirmation. */
  const [pendingConfirm, setPendingConfirm] = useState<
    FulfillmentClient[] | null
  >(null);

  if (!open) return null;

  const isNative = partner?.mode === "native_creditops";

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!EMAIL_RE.test(email)) e.email = "Invalid email format";
    if (phone && !PHONE_RE.test(phone)) e.phone = "Invalid phone format";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => {
    const scopeId = partner?.scopeId ?? "all";
    const base = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      status,
      round,
      assignedAgent: assignee,
      openItems: 0,
      autoSync: partner?.mode === "saas_pulled",
    };
    if (partner?.mode === "outsourcing_only") {
      return {
        ...base,
        mode: "outsourcing_only" as const,
        outsourcingGroupId: scopeId,
        outsourcingGroupName: partner.name,
      };
    }
    return {
      ...base,
      mode: "saas_pulled" as const,
      organizationId: scopeId,
      organizationName: partner?.name ?? "Managed Ops",
    };
  };

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setStatus("Onboarding");
    setRound("Pre-Round");
    setAssignee("Unassigned");
    setErrors({});
    setPendingConfirm(null);
  };

  const handleSave = () => {
    if (!validate()) return;
    const outcome = store.addClient(buildPayload());

    // HARD BLOCK — same email already exists on this partner.
    if (outcome.blocked && outcome.existing) {
      setErrors({
        email: `This email already exists on ${partner?.name ?? "this partner"} as "${outcome.existing.name}". One email = one file per partner.`,
      });
      return;
    }

    // CROSS-PARTNER — warn and require explicit confirmation before adding.
    if (outcome.crossScopeMatches.length > 0 && !pendingConfirm) {
      setPendingConfirm(outcome.crossScopeMatches);
      return;
    }

    // Confirmed (or no conflict) → done.
    reset();
    onClose();
  };

  const handleConfirmCrossPartner = () => {
    // Re-add now that the user has confirmed; addClient will still block
    // a same-scope dup (shouldn't happen here) but allow the cross-scope add.
    store.addClient(buildPayload());
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" /> Add Client
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {isNative && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700">
              This Partner uses the native BES CreditOps SaaS connection. New
              clients are typically pulled from their workspace. Use this form
              only to add a manual record that is not in their system.
            </div>
          )}

          {/* Cross-partner duplicate warning — requires confirmation */}
          {pendingConfirm && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1.5">
                  <p className="font-bold">
                    This client exists on another partner's list
                  </p>
                  <div className="space-y-0.5">
                    {pendingConfirm.map((m) => (
                      <div key={m.id}>
                        • <strong>{m.name}</strong> — {clientGroupLabel(m)}{" "}
                        (status: {m.status})
                      </div>
                    ))}
                  </div>
                  <p>
                    This can happen when a client cancels with one company and
                    re-enrolls with another, or shops both at once. Confirm only
                    if this is a legitimate separate enrollment.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground">
              Client Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-[11px] text-red-600">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Email *
              </label>
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: "" }));
                  setPendingConfirm(null);
                }}
                placeholder="jane@email.com"
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.email && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {errors.email}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">
                Phone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.phone && (
                <p className="mt-1 text-[11px] text-red-600">{errors.phone}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as FulfillmentClient["status"])
                }
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option>Onboarding</option>
                <option>Ready for Processing</option>
                <option>In Processing</option>
                <option>Ready for QA</option>
                <option>In Dispute</option>
                <option>Awaiting Response</option>
                <option>Completed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">
                Round
              </label>
              <select
                value={round}
                onChange={(e) =>
                  setRound(e.target.value as FulfillmentClient["round"])
                }
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option>Pre-Round</option>
                <option>Round 1</option>
                <option>Round 2</option>
                <option>Round 3</option>
                <option>Round 4+</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">
                Assignee
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ELIGIBLE_ASSIGNEES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          {pendingConfirm ? (
            <>
              <button
                onClick={() => setPendingConfirm(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Go back
              </button>
              <button
                onClick={handleConfirmCrossPartner}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:opacity-90"
              >
                Confirm separate enrollment
              </button>
            </>
          ) : (
            <button
              onClick={handleSave}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              Add Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
