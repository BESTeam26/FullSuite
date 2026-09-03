/**
 * OpsAddClientModal — creates a manual client record for any division.
 *
 * Enforces the ONE EMAIL = ONE FILE PER PARTNER rule:
 *  - Same email already on THIS partner → hard block, cannot add.
 *  - Same email on a DIFFERENT partner → warn + require explicit confirm
 *    (cancel & re-enroll / shopping both companies scenario).
 *
 * The shared modal owns the common fields, validation, and the whole conflict
 * flow. Each division supplies its status vocabulary, its one extra field
 * (dispute Round vs Requested amount) and how to build its own record.
 */

import { useState, type ReactNode } from "react";
import { X, UserPlus, AlertTriangle, ShieldAlert } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  clientGroupLabel,
  type ClientConflictResult,
  type OpsClient,
} from "@/lib/fulfillment/ops-client-domain";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+-]{7,}$/;

/** The fields every division collects, handed back when building a record. */
export interface CommonClientFields {
  name: string;
  email: string;
  phone?: string;
  status: string;
  assignee: string;
}

interface OpsAddClientModalProps<T extends OpsClient> {
  open: boolean;
  onClose: () => void;
  /**
   * Partners the user may file this client under. Supplied when the modal is
   * opened outside a partner workspace (the management-level client list),
   * where there is no partner in context. A client must belong to exactly one
   * partner, so intake asks rather than guessing — the previous behaviour was
   * to invent the string "all", which reached a uuid column and failed.
   */
  partnerOptions?: { scopeId: string; name: string; mode: string }[];
  /** Shown when the partner runs on the division's native SaaS connection. */
  isNative: boolean;
  nativeNotice: ReactNode;
  /** Partner name, used in the hard-block message. */
  partnerName?: string;
  statusOptions: readonly string[];
  defaultStatus: string;
  assignees: readonly string[];
  /**
   * The division's extra field, rendered between Status and Assignee. The
   * division owns its state and clears it via onResetExtras.
   */
  extraField: ReactNode;
  onResetExtras: () => void;
  /** Build the division's record from the common fields. */
  buildPayload: (
    common: CommonClientFields,
    /** The partner chosen in the modal, when the caller had none in context. */
    chosen?: { scopeId: string; name: string; mode: string },
  ) => Omit<T, "id" | "lastActivity" | "createdAt">;
  /** Reports what this record would collide with, WITHOUT writing anything. */
  onCheckConflict: (
    payload: Omit<T, "id" | "lastActivity" | "createdAt">,
  ) => ClientConflictResult<T>;
  /** Commits the record. Only called once the add is actually authorised. */
  onAdd: (payload: Omit<T, "id" | "lastActivity" | "createdAt">) => void;
}

export function OpsAddClientModal<T extends OpsClient>({
  open,
  onClose,
  isNative,
  nativeNotice,
  partnerName,
  statusOptions,
  defaultStatus,
  assignees,
  extraField,
  onResetExtras,
  buildPayload,
  partnerOptions,
  onCheckConflict,
  onAdd,
}: OpsAddClientModalProps<T>) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [assignee, setAssignee] = useState("Unassigned");
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Cross-partner matches awaiting explicit confirmation. */
  const [pendingConfirm, setPendingConfirm] = useState<T[] | null>(null);
  const [pickedScope, setPickedScope] = useState("");

  const needsPartnerChoice = Boolean(partnerOptions?.length);
  const chosenPartner = partnerOptions?.find((p) => p.scopeId === pickedScope);

  if (!open) return null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!EMAIL_RE.test(email)) e.email = "Invalid email format";
    if (phone && !PHONE_RE.test(phone)) e.phone = "Invalid phone format";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const currentPayload = () =>
    buildPayload(
      {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        status,
        assignee,
      },
      chosenPartner,
    );

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setStatus(defaultStatus);
    setAssignee("Unassigned");
    setErrors({});
    setPendingConfirm(null);
    onResetExtras();
  };

  const handleSave = () => {
    if (!validate()) return;
    const payload = currentPayload();

    // Ask what this WOULD collide with before writing anything. Checking first
    // is what makes the confirmation below a real gate rather than a notice
    // after the fact.
    const conflict = onCheckConflict(payload);

    // HARD BLOCK — same email already exists on this partner.
    if (conflict.sameScopeDuplicate) {
      setErrors({
        email: `This email already exists on ${partnerName ?? "this partner"} as "${conflict.sameScopeDuplicate.name}". One email = one file per partner.`,
      });
      return;
    }

    // CROSS-PARTNER — warn and require explicit confirmation before adding.
    if (conflict.crossScopeMatches.length > 0 && !pendingConfirm) {
      setPendingConfirm(conflict.crossScopeMatches);
      return;
    }

    onAdd(payload);
    reset();
    onClose();
  };

  const handleConfirmCrossPartner = () => {
    // The agent has confirmed this is a legitimate separate enrollment; this is
    // the first and only write for the cross-partner path.
    onAdd(currentPayload());
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
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-status-success">
              {nativeNotice}
            </div>
          )}

          {/* Cross-partner duplicate warning — requires confirmation */}
          {pendingConfirm && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-status-warning">
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
              <p className="mt-1 text-[11px] text-status-danger">
                {errors.name}
              </p>
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
                <p className="mt-1 flex items-start gap-1 text-[11px] text-status-danger">
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
                <p className="mt-1 text-[11px] text-status-danger">
                  {errors.phone}
                </p>
              )}
            </div>
          </div>

          {needsPartnerChoice && (
            <div>
              <label className="text-xs font-semibold text-foreground">
                Partner
              </label>
              <OpsSelect
                value={pickedScope}
                onValueChange={setPickedScope}
                options={(partnerOptions ?? []).map((p) => ({
                  value: p.scopeId,
                  label: p.name,
                }))}
                size="field"
                placeholder="Choose a partner…"
                aria-label="Partner"
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                A client belongs to exactly one partner. This decides the
                duplicate-email scope.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Status
              </label>
              <OpsSelect
                value={status}
                onValueChange={setStatus}
                options={statusOptions}
                size="field"
                aria-label="Status"
                className="mt-1"
              />
            </div>
            {extraField}
            <div>
              <label className="text-xs font-semibold text-foreground">
                Assignee
              </label>
              <OpsSelect
                value={assignee}
                onValueChange={setAssignee}
                options={assignees}
                size="field"
                aria-label="Assignee"
                className="mt-1"
              />
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
              disabled={needsPartnerChoice && !chosenPartner}
              title={
                needsPartnerChoice && !chosenPartner
                  ? "Choose which partner this client belongs to."
                  : undefined
              }
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
