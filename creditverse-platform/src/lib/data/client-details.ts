/**
 * Correcting a client's details from the CreditOps file.
 *
 * Dee, 2026-09-24: "I also need a WAY TO EDIT ALL THESE INFORMATION." Until
 * now the only things editable on a client file were the three work fields in
 * the header — status, owner, due date. A wrong phone number, a missing date
 * of birth or an address the import could not parse had no way in at all, and
 * 71 clients just arrived from ClickUp carrying exactly those gaps.
 *
 * ── WHY IT WRITES TWO RECORDS ─────────────────────────────────────────────
 *
 * The PERSON lives in `clients` — name, contact, date of birth, address —
 * because those follow them between CreditOps, FundingOps and DIY. The
 * CreditOps WORK FILE keeps its own copy of the name, email and phone, which
 * is what the client list and every queue read.
 *
 * That duplication predates this and is not something a save dialog should
 * decide to resolve. What it must not do is let the two drift, so a save
 * writes both and the fulfillment row is updated from the same values, in one
 * action. If one fails the error surfaces; nothing is silently half-saved.
 *
 * Neither write decides permission. `clients` is gated by `client_writable()`
 * and `fulfillment_clients` by its own policy, so somebody who may not edit
 * gets a refusal from Postgres rather than a button that does nothing.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { updateClientIdentity, type ClientIdentityPatch } from "@/lib/data/clients";

export interface ClientDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

/** The canonical person behind a CreditOps work file. */
export async function canonicalClientIdFor(fulfillmentClientId: string): Promise<string | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select("client_id")
    .eq("id", fulfillmentClientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.client_id as string) ?? null;
}

export async function fetchClientDetails(fulfillmentClientId: string): Promise<ClientDetails | null> {
  const sb = requireSupabase();
  const canonical = await canonicalClientIdFor(fulfillmentClientId);
  if (!canonical) return null;
  const { data, error } = await sb
    .from("clients")
    .select("first_name, last_name, email, phone, date_of_birth, address_line1, city, state, postal_code")
    .eq("id", canonical)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, string | null>;
  return {
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    dateOfBirth: r.date_of_birth ?? "",
    addressLine1: r.address_line1 ?? "",
    city: r.city ?? "",
    state: r.state ?? "",
    postalCode: r.postal_code ?? "",
  };
}

/** Two letters or nothing — the column refuses anything longer. */
export function stateProblem(value: string): string | null {
  const t = value.trim();
  if (t === "" || /^[A-Za-z]{2}$/.test(t)) return null;
  return "Use the two-letter code, like FL.";
}

export async function saveClientDetails(
  fulfillmentClientId: string,
  next: ClientDetails,
): Promise<void> {
  const problem = stateProblem(next.state);
  if (problem) throw new Error(problem);

  const canonical = await canonicalClientIdFor(fulfillmentClientId);
  if (!canonical) throw new Error("This file has no canonical client record.");

  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  const patch: ClientIdentityPatch = {
    firstName: blank(next.firstName),
    lastName: next.lastName.trim(),
    email: next.email.trim(),
    phone: blank(next.phone),
    dateOfBirth: blank(next.dateOfBirth),
    addressLine1: blank(next.addressLine1),
    city: blank(next.city),
    state: blank(next.state)?.toUpperCase() ?? null,
    postalCode: blank(next.postalCode),
  };
  await updateClientIdentity(canonical, patch);

  /* The work file's copy, kept in step in the same action so the client list
     and the file cannot disagree about somebody's phone number. */
  const sb = requireSupabase();
  const fullName = [next.firstName.trim(), next.lastName.trim()].filter(Boolean).join(" ");
  const { error } = await sb
    .from("fulfillment_clients")
    .update({
      name: fullName || undefined,
      email: next.email.trim() || undefined,
      phone: blank(next.phone),
      date_of_birth: blank(next.dateOfBirth),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", fulfillmentClientId);
  if (error) throw error;
}
