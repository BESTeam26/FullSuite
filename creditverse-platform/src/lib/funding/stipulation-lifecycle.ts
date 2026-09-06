/**
 * The stipulation lifecycle, mirrored for the interface.
 *
 * The database is the authority: `document_request_transition_allowed()` in
 * migration 0113 decides, and `move_document_request()` refuses anything else.
 * This table exists so a screen can offer the right next steps instead of
 * presenting every state and letting most of them fail — and it is a copy of
 * one rule, kept beside a test that says so.
 */
import type { Enums } from "@/lib/supabase/database.types";

export type RequestStatus = Enums<"document_request_status">;

/** `open` IS "Requested" — the value predates the lifecycle and was not renamed. */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Requested",
  assigned: "Assigned",
  waiting_on_client: "Waiting on client",
  received: "Received",
  under_review: "Under review",
  submitted_to_lender: "Submitted to lender",
  satisfied: "Satisfied",
  waived: "Waived",
};

/** Display order, which is also the happy path. */
export const REQUEST_STATUS_ORDER: RequestStatus[] = [
  "open",
  "assigned",
  "waiting_on_client",
  "received",
  "under_review",
  "submitted_to_lender",
  "satisfied",
];

const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  open: ["assigned", "waiting_on_client", "received"],
  assigned: ["open", "waiting_on_client", "received"],
  waiting_on_client: ["assigned", "received"],
  received: ["under_review", "waiting_on_client"],
  under_review: ["waiting_on_client", "submitted_to_lender"],
  submitted_to_lender: ["under_review", "satisfied"],
  /* Satisfied reopens only through the document path — superseding the
     instance that satisfied it already puts the row back to `open`. */
  satisfied: [],
  waived: ["open"],
};

export function nextStatuses(from: RequestStatus): RequestStatus[] {
  const forward = ALLOWED[from] ?? [];
  /* Waiving is available from anywhere except satisfied, and needs a reason. */
  return from === "satisfied" || from === "waived" ? forward : [...forward, "waived"];
}

export function transitionAllowed(from: RequestStatus, to: RequestStatus): boolean {
  if (from === to) return false;
  return nextStatuses(from).includes(to);
}

/** Outstanding means somebody still has to do something about it. */
export function isOutstanding(status: RequestStatus): boolean {
  return status !== "satisfied" && status !== "waived";
}
