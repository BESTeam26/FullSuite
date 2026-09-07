/**
 * Posting a letter, from the browser's side.
 *
 * The browser never talks to Lob and never holds its key. It asks the Edge
 * Function, which checks the caller's own permission in the database first,
 * posts, and records what came back. What returns here is a receipt.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type MailingStatus =
  | "queued"
  | "submitted"
  | "in_transit"
  | "delivered"
  | "returned"
  | "failed"
  | "cancelled";

export const MAILING_STATUS_LABEL: Record<MailingStatus, string> = {
  queued: "Queued",
  submitted: "Accepted by Lob",
  in_transit: "In transit",
  delivered: "Delivered",
  returned: "Returned",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface PostalAddress {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface LetterMailing {
  id: string;
  letterId: string;
  providerId: string | null;
  status: MailingStatus;
  providerMode: "live" | "test" | "unknown";
  expectedDeliveryDate: string | null;
  trackingNumber: string | null;
  costCents: number | null;
  error: string | null;
  requestedAt: string;
  submittedAt: string | null;
  to: PostalAddress;
}

export interface PostLetterResult {
  mailingId: string;
  providerId: string | null;
  mode: "live" | "test";
  expectedDelivery: string | null;
  trackingNumber: string | null;
  costCents: number | null;
  /** False for a test key: simulated, not posted. */
  posted: boolean;
}

export async function postLetter(input: {
  letterId: string;
  to: PostalAddress;
  from: PostalAddress;
  body: string;
  certified?: boolean;
}): Promise<PostLetterResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("post-letter", { body: input });
  if (error) {
    const detail = (error as { context?: { body?: unknown } }).context?.body;
    throw new Error(typeof detail === "string" ? detail : (error as Error).message);
  }
  return data as PostLetterResult;
}

export async function fetchLetterMailings(letterIds: string[]): Promise<LetterMailing[]> {
  if (letterIds.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("letter_mailings")
    .select(
      "id, letter_id, provider_id, status, provider_mode, expected_delivery_date, tracking_number, cost_cents, error, requested_at, submitted_at, to_name, to_line1, to_line2, to_city, to_state, to_zip",
    )
    .in("letter_id", letterIds)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    letterId: r.letter_id,
    providerId: r.provider_id,
    status: r.status as MailingStatus,
    providerMode: r.provider_mode as LetterMailing["providerMode"],
    expectedDeliveryDate: r.expected_delivery_date,
    trackingNumber: r.tracking_number,
    costCents: r.cost_cents,
    error: r.error,
    requestedAt: r.requested_at,
    submittedAt: r.submitted_at,
    to: {
      name: r.to_name,
      line1: r.to_line1,
      line2: r.to_line2,
      city: r.to_city,
      state: r.to_state,
      zip: r.to_zip,
    },
  }));
}
