/**
 * Drains the EOD email outbox.
 *
 * ---------------------------------------------------------------------------
 * NOT A SECOND EMAIL SERVICE.
 *
 * The provider, the sender, the domain and the layout are the ones FullSuite
 * already uses — `_shared/email-template.ts`, Resend, MAIL_FROM. This function
 * decides only WHAT an end-of-day report says and marks each row done. It is a
 * sibling of `billing-email`, deliberately built the same way, because two
 * different ways of sending mail is how two different-looking emails go out
 * over the same signature.
 * ---------------------------------------------------------------------------
 *
 * ── WHY A QUEUE ────────────────────────────────────────────────────────────
 *
 * Dee, 2026-09-16: "Email failure must NOT undo a valid EOD submission." If
 * submitting tried to send, a provider outage would roll back somebody's whole
 * day of work. So submitting queues inside its own transaction and this sends,
 * which is also what lets the screen say "EOD submitted · Email delivery
 * failed" instead of having to choose between the two.
 *
 * ── IDEMPOTENCY ────────────────────────────────────────────────────────────
 *
 * A unique index on (eod_id, kind) means a report can only ever have one
 * queued email, however many times it is re-submitted, and only `pending` or
 * `failed` rows are claimed. Running this twice in a minute sends nothing
 * twice.
 *
 * ── AUTHENTICATION ─────────────────────────────────────────────────────────
 *
 * Called by `eod_email_dispatch()` with a shared secret from the Vault. No user
 * session is involved and none is accepted. Deployed with `--no-verify-jwt`,
 * because `pg_net` carries no user token and the constant-time check below is
 * the door instead — a `!==` on a secret leaks its prefix a byte at a time to
 * anyone patient enough to measure.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailBrand } from "../_shared/email-template.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const BATCH = 25;

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
  eod_id: string;
  to_email: string | null;
  to_name: string | null;
  cc_email: string | null;
  subject: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const day = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/**
 * Minutes as somebody would say them. 402 is "6h 42m", not "402".
 */
const duration = (minutes: unknown): string => {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 0) return "Not available";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * A figure, or an honest absence.
 *
 * Dee: "If a metric cannot be calculated: show Not available rather than 0.
 * Zero means the system actually knows the value is zero." A missing snapshot
 * key is not a quiet day; it is a day nobody measured.
 */
const count = (value: unknown): string =>
  value === null || value === undefined ? "Not available" : String(Number(value));

const arrayLen = (value: unknown): string =>
  Array.isArray(value) ? String(value.length) : "Not available";

/** A section the employee typed, or nothing at all — never an empty heading. */
function section(title: string, body: unknown): string | null {
  const text = typeof body === "string" ? body.trim() : "";
  return text ? `${title}\n${text}` : null;
}

function compose(row: OutboxRow, brand: EmailBrand, appUrl: string) {
  const p = row.payload;
  const snap = (p.snapshot ?? {}) as Record<string, unknown>;
  const employee = String(p.employee_name ?? "A team member");

  /* The automatic half, in Dee's order. Rendered as one block of lines rather
     than a table: email clients mangle tables and this has to stay readable on
     a phone at six in the evening. */
  const productivity = [
    `Production Completed: ${count(snap.production_units)}`,
    `Tasks Completed: ${count(snap.actions_completed)}`,
    `Worked On: ${arrayLen(snap.worked)}`,
    `In Progress: ${arrayLen(snap.in_progress)}`,
    `Overdue: ${arrayLen(snap.overdue)}`,
    `Blocked: ${arrayLen(snap.blocked)}`,
    `Time Logged: ${duration(snap.minutes_logged)}`,
  ].join("\n");

  const written = [
    section("ACCOMPLISHMENTS", p.accomplishments),
    section("BLOCKERS & ISSUES", p.blockers),
    section("HELP NEEDED", p.help_needed),
    section("HANDOFF / NOTES FOR TOMORROW", p.handoff),
    section("NOTES", p.notes),
  ].filter((x): x is string => x !== null);

  return {
    heading: "End of Day Productivity Report",
    paragraphs: [
      `${employee}\n${day(p.work_date)}`,
      `PRODUCTIVITY REPORT\n${productivity}`,
      ...written,
    ],
    action: { label: "View EOD Report", url: `${appUrl}/app/team-eod` },
    security: [
      `Sent by ${brand.name} when ${employee} submitted their end-of-day report.`,
      "Reply to this email to reach them.",
    ],
    brand,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const expected = Deno.env.get("EOD_DISPATCH_SECRET")?.trim();
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
    const { count: waiting } = await sb.from("eod_email_outbox")
      .select("id", { count: "exact", head: true }).eq("state", "pending");
    return json(503, { error: "Email is not connected", code: "not_connected", waiting: waiting ?? 0 });
  }

  const { data, error } = await sb
    .from("eod_email_outbox")
    .select("id, eod_id, to_email, to_name, cc_email, subject, payload, attempts")
    .in("state", ["pending", "failed"])
    .lt("attempts", 5)
    .not("to_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return json(500, { error: error.message });

  const rows = (data ?? []) as OutboxRow[];
  /* Name and colours from the AGENCY RECORD, the same place every other
     function reads them, so two BES emails never look like two companies. */
  const { data: agency } = await sb
    .from("agencies").select("name, branding").order("created_at").limit(1).maybeSingle();
  const branding = (agency?.branding ?? {}) as { logoUrl?: string; primaryColor?: string };
  const brand: EmailBrand = {
    name: agency?.name ?? "Blessed Empire Services",
    primaryColor: branding.primaryColor ?? "#0f5132",
    logoUrl: branding.logoUrl ?? null,
    tagline: "Process. Systems. People.",
  };

  let sent = 0;
  const failed: string[] = [];
  const now = () => new Date().toISOString();

  for (const row of rows) {
    const result = await sendEmail({
      apiKey: mailKey,
      from,
      fromName: brand.name,
      to: row.to_email as string,
      /* The permanent operational record. A CC rather than a BCC so the Team
         Lead can see that support@ has it too. */
      cc: row.cc_email ? [row.cc_email] : undefined,
      subject: row.subject,
      content: compose(row, brand, origin),
      replyTo,
    });

    if (result.ok) {
      sent += 1;
      await sb.from("eod_email_outbox").update({
        state: "sent", sent_at: now(), attempts: row.attempts + 1,
        last_error: null, provider_message_id: result.providerMessageId ?? null,
        updated_at: now(),
      }).eq("id", row.id);
    } else {
      failed.push(row.id);
      await sb.from("eod_email_outbox").update({
        state: "failed", attempts: row.attempts + 1,
        /* `hint` is what an operator should DO; `detail` is what the provider
           said. Both, because "550" on its own helps nobody. */
        last_error: [result.status, result.hint, result.detail].filter(Boolean).join(" · ").slice(0, 400),
        updated_at: now(),
      }).eq("id", row.id);
    }
  }

  /* `sent` is what the provider accepted, nothing more. */
  return json(200, { sent, failed: failed.length, considered: rows.length });
});
