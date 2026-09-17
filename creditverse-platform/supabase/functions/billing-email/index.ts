/**
 * Drains the billing email outbox.
 *
 * ---------------------------------------------------------------------------
 * NOT A SECOND EMAIL SERVICE.
 *
 * The provider, the sender, the domain and the template are the ones FullSuite
 * already uses — `_shared/email-template.ts`, Resend, MAIL_FROM. This function
 * only decides WHAT the billing messages say and marks each row done.
 * ---------------------------------------------------------------------------
 *
 * ── WHY IT IS A QUEUE AND NOT A DIRECT SEND ─────────────────────────────────
 *
 * The reminder is written inside the sweep's transaction, where an HTTP call
 * has no business being: a slow mail provider would hold a lock on the invoice
 * table, and a failed one would roll back a reminder that had already been
 * decided. So the sweep records the intent and this drains it.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *
 * `dedupe_key` is unique on the outbox, and only rows still `pending` or
 * `failed` are claimed. Running this twice in the same minute sends nothing
 * twice, and a duplicate provider event later cannot produce a second receipt
 * because the payment id is the key.
 *
 * ── AUTHENTICATION ──────────────────────────────────────────────────────────
 *
 * Called by `billing_email_dispatch()` with a shared secret from the Vault.
 * There is no user session involved and none is accepted: this sends mail on
 * BES's behalf, so the only caller is the database. Deployed with
 * `--no-verify-jwt` for that reason — `pg_net` carries no user token, and the
 * check below is the door instead.
 *
 * The comparison is constant-time. A `!==` on a secret leaks its prefix one
 * byte at a time to anyone patient enough to measure, and this endpoint sends
 * mail in BES's name.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailBrand } from "../_shared/email-template.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const BATCH = 25;

/** Compares in time proportional to length, never to how much matched. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

interface OutboxRow {
  id: string;
  kind: "reminder" | "receipt" | "reactivated" | "invoice";
  to_email: string | null;
  to_name: string | null;
  subject: string;
  payload: Record<string, unknown>;
  attempts: number;
  reminder_id: string | null;
}

const money = (cents: unknown, currency: unknown): string => {
  const n = Number(cents ?? 0) / 100;
  const code = typeof currency === "string" && currency.length === 3 ? currency : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
};

const day = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** How a partner is told to pay, in a sentence rather than a code. */
const howToPay = (method: unknown): string => {
  switch (method) {
    case "autopay":
      return "This invoice will be charged automatically to your saved card on the due date. "
           + "You can pay it earlier from the portal if you prefer — AutoPay will not then charge it again.";
    case "card_on_file":
      return "You can pay this from the portal with your saved card, or with a different one.";
    case "card_one_time":
      return "You can pay this by card from the portal. Your card is not stored unless you ask us to save it.";
    case "paypal":
      return "You can pay this by PayPal. Please quote the invoice number as the reference so we can match it.";
    case "wise":
      return "You can pay this by Wise. Please quote the invoice number as the reference so we can match it.";
    default:
      return "Please quote the invoice number as the payment reference so we can match it to this invoice.";
  }
};

/**
 * What each message says.
 *
 * Days 1–3 are reminders. Day 5 says plainly that it is still unpaid. Day 7
 * says service will be placed on hold — and says, in the same breath, that
 * nothing is deleted, because that is true and because a partner who fears
 * losing their data stops talking to you (Dee, 2026-09-13: "Do not say data
 * will be deleted. It will not be.").
 */
function compose(row: OutboxRow, brand: EmailBrand, portalUrl: string) {
  const p = row.payload;
  const partner = String(p.partner_name ?? "your account");

  /* THE INVOICE ITSELF. Until 20260917002200 this did not exist: an invoice
     was marked sent and the first thing a partner heard about it was the Day 1
     overdue reminder. */
  if (row.kind === "invoice") {
    const lines = Array.isArray(p.lines) ? p.lines as Record<string, unknown>[] : [];
    return {
      heading: `Invoice ${p.invoice_number}`,
      paragraphs: [
        `Here is invoice ${p.invoice_number} for ${partner}, for ${money(p.total_cents, p.currency)}, `
          + `due ${day(p.due_date)}.`,
        [
          ...lines.map((l) => `${l.description} — ${money(l.amount_cents, p.currency)}`),
          lines.length > 0 ? "" : null,
          `Total: ${money(p.total_cents, p.currency)}`,
          `Due: ${day(p.due_date)}`,
        ].filter((x) => x !== null).join("\n"),
        howToPay(p.collection_method),
        "If anything on this invoice looks wrong, reply to this email before it falls due and we will check it.",
      ],
      action: { label: "View and pay", url: portalUrl },
      security: [`Sent by ${brand.name}. This is an invoice, not a request for card details by email —`,
                 "we will never ask you to send a card number in a reply."],
      brand,
    };
  }

  if (row.kind === "receipt") {
    const balance = p.balance_cents === null || p.balance_cents === undefined
      ? null : Number(p.balance_cents);
    const paragraphs = [
      `Thank you — we have recorded a payment of ${money(p.amount_cents, p.currency)} for ${partner}.`,
      [
        p.invoice_number ? `Invoice: ${p.invoice_number}` : null,
        `Method: ${p.method ?? "—"}`,
        p.reference ? `Reference: ${p.reference}` : null,
        `Date: ${day(p.paid_on)}`,
      ].filter(Boolean).join("\n"),
      balance === null
        ? "This payment has not yet been matched to a specific invoice. We will confirm once it is."
        : balance > 0
          ? `Remaining balance on this invoice: ${money(balance, p.currency)}.`
          : "This invoice is now settled in full.",
    ];
    if (p.reactivated === true) {
      paragraphs.push("Your BES account has been reactivated and work has resumed.");
    }
    return {
      heading: "Payment received",
      paragraphs,
      action: { label: "View your billing", url: portalUrl },
      security: [`This is a record of a payment received by ${brand.name}.`,
                 "If anything here looks wrong, reply to this email and we will check it."],
      brand,
    };
  }

  const total = money(p.total_cents, p.currency);
  const paid = Number(p.paid_cents ?? 0);
  const balance = money(p.balance_cents, p.currency);
  const days = Number(p.days_overdue ?? 0);
  const facts = [
    `Invoice: ${p.invoice_number}`,
    `Amount: ${total}`,
    paid > 0 ? `Paid so far: ${money(paid, p.currency)}` : null,
    `Balance due: ${balance}`,
    `Due date: ${day(p.due_date)}`,
    `Days overdue: ${days}`,
  ].filter(Boolean).join("\n");

  if (p.is_final === true) {
    return {
      heading: "Final payment reminder",
      paragraphs: [
        `Invoice ${p.invoice_number} for ${partner} is ${days} days past due and ${balance} remains outstanding.`,
        facts,
        "If the overdue balance is not settled, active service on your account will be placed on hold for nonpayment. Your account, clients, files and history all remain exactly as they are — nothing is deleted — and work resumes as soon as the balance is settled.",
        "If you have already paid, or something about this invoice is wrong, reply to this email and we will sort it out.",
      ],
      action: { label: "View and pay", url: portalUrl },
      security: [`Sent by ${brand.name} regarding an outstanding invoice.`],
      brand,
    };
  }

  if (p.is_warning === true) {
    return {
      heading: "Payment warning",
      paragraphs: [
        `Invoice ${p.invoice_number} for ${partner} remains unpaid, ${days} days after its due date.`,
        facts,
        "Please arrange payment, or reply to this email if there is a problem with the invoice.",
      ],
      action: { label: "View and pay", url: portalUrl },
      security: [`Sent by ${brand.name} regarding an outstanding invoice.`],
      brand,
    };
  }

  return {
    heading: "Payment reminder",
    paragraphs: [
      `This is a reminder that invoice ${p.invoice_number} for ${partner} is now ${days === 1 ? "a day" : `${days} days`} past its due date.`,
      facts,
      "If you have already sent payment, thank you — please ignore this and let us know the reference so we can match it.",
    ],
    action: { label: "View and pay", url: portalUrl },
    security: [`Sent by ${brand.name} regarding an outstanding invoice.`],
    brand,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const expected = Deno.env.get("BILLING_DISPATCH_SECRET")?.trim();
  const offered = req.headers.get("x-dispatch-secret")?.trim();
  if (!expected || !offered || !timingSafeEqual(expected, offered)) {
    return json(401, { error: "not authorised" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Function is not configured" });

  const mailKey = Deno.env.get("MAIL_PROVIDER_API_KEY")?.trim();
  const from = Deno.env.get("MAIL_FROM")?.trim() ?? "";
  const replyTo = Deno.env.get("MAIL_REPLY_TO")?.trim() || undefined;
  const origin = (Deno.env.get("APP_ORIGINS") ?? "https://app.bescrm.net")
    .split(",")[0].trim().replace(/\/$/, "");

  const sb = createClient(url, serviceKey);

  if (!mailKey || !from) {
    /* Honest: the queue stays, nothing is marked sent, and the count says how
       much is waiting. */
    const { count } = await sb.from("billing_email_outbox")
      .select("id", { count: "exact", head: true }).eq("state", "pending");
    return json(503, { error: "Email is not connected", code: "not_connected", waiting: count ?? 0 });
  }

  const { data, error } = await sb
    .from("billing_email_outbox")
    .select("id, kind, to_email, to_name, subject, payload, attempts, reminder_id")
    .in("state", ["pending", "failed"])
    .lt("attempts", 5)
    .not("to_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return json(500, { error: error.message });

  const rows = (data ?? []) as OutboxRow[];
  /* The name and colours come from the AGENCY RECORD, the same place
     `send-invitation` reads them. Hard-coding them here is how one email says
     "Blessed Empire Services" and the next says something else (Dee,
     2026-09-13, having received exactly that). */
  const { data: agency } = await sb
    .from("agencies")
    .select("name, branding")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const agencyBranding = (agency?.branding ?? {}) as { logoUrl?: string; primaryColor?: string };
  const brand: EmailBrand = {
    name: agency?.name ?? "Blessed Empire Services",
    primaryColor: agencyBranding.primaryColor ?? "#0f5132",
    logoUrl: agencyBranding.logoUrl ?? null,
  };
  let sent = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const content = compose(row, brand, `${origin}/partner`);
    const result = await sendEmail({
      apiKey: mailKey,
      from,
      fromName: brand.name,
      to: row.to_email as string,
      subject: row.subject,
      content: { ...content, brand },
      replyTo,
    });

    if (result.ok) {
      sent += 1;
      await sb.from("billing_email_outbox")
        .update({ state: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      /* The reminder carries its own delivery state, so "was this one
         emailed?" is answered on the reminder rather than by joining. */
      if (row.reminder_id) {
        await sb.from("partner_invoice_reminders")
          .update({ email_state: "sent", email_sent_at: new Date().toISOString() })
          .eq("id", row.reminder_id);
      }
    } else {
      failed.push(row.id);
      if (row.reminder_id) {
        await sb.from("partner_invoice_reminders").update({ email_state: "failed" }).eq("id", row.reminder_id);
      }
      await sb.from("billing_email_outbox")
        .update({ state: "failed", attempts: row.attempts + 1, /* `hint` is what an operator should DO; `detail` is what the
             provider said. Both, because "550" alone helps nobody. */
          last_error: [result.status, result.hint, result.detail].filter(Boolean).join(" · ").slice(0, 400), updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  /* `sent` is what the provider accepted, nothing more. A count that includes
     the ones that bounced is the report that costs a day. */
  return json(200, { sent, failed: failed.length, considered: rows.length });
});
