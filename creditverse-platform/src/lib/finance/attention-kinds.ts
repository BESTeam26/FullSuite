/**
 * The exception kinds the `billing_attention` view produces, and what to do
 * about each one.
 *
 * The view decides WHICH exceptions exist; this decides how they are named and
 * what a person should do next. Kept beside the screens rather than in the
 * database because "send a reminder" is a working instruction, not a fact
 * about the data — and it is the one part that should read differently as BES
 * changes how it collects.
 *
 * Every kind the view can emit is listed, so a category with nothing in it is
 * still shown as zero. A tab that disappears when it is clear reads as a tab
 * nobody checked.
 */
export interface AttentionKind {
  kind: string;
  label: string;
  /** What a person does about it. */
  nextAction: string;
}

export const ATTENTION_KINDS: AttentionKind[] = [
  { kind: "suspended_nonpayment", label: "Suspended", nextAction: "Collect, then lift the hold" },
  { kind: "payment_unknown", label: "Payment unknown", nextAction: "Confirm at the processor before retrying" },
  { kind: "autopay_failed", label: "AutoPay failed", nextAction: "Ask for another card" },
  { kind: "final_reminder_sent", label: "Final reminder sent", nextAction: "Escalate or suspend" },
  { kind: "past_due", label: "Past due", nextAction: "Send a reminder" },
  { kind: "missing_billing_email", label: "No billing email", nextAction: "Add a billing contact" },
  { kind: "delivery_failed", label: "Delivery failed", nextAction: "Check the address, then resend" },
  { kind: "payment_matching_review", label: "Needs matching", nextAction: "Match it in Payment Matching" },
  { kind: "billing_terms_missing_rate", label: "No billing rate", nextAction: "Set the rate on the service" },
];

const BY_KIND = new Map(ATTENTION_KINDS.map((k) => [k.kind, k]));

export const labelFor = (kind: string): string => BY_KIND.get(kind)?.label ?? kind.replace(/_/g, " ");
/** A kind this build does not know about still gets an honest instruction. */
export const nextActionFor = (kind: string): string => BY_KIND.get(kind)?.nextAction ?? "Review";
