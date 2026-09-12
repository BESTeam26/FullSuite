/**
 * Sends an invitation email for an open invitation the caller may see.
 *
 * Two kinds, one function:
 *   • an **organization** invitation is branded as that organization — their
 *     logo, their colour, their name — because that is who the person is
 *     joining. A BES-branded email would confuse a customer's own staff;
 *   • a **BES team** invitation is branded as BES.
 *
 * The invitation is read with the caller's own session, so row-level security
 * decides whether they may send it; the token is never listed anywhere else.
 * Without MAIL_PROVIDER_API_KEY it answers 503 and the administrator copies
 * the link instead — it does not pretend an email went out.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailBrand } from "../_shared/email-template.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  /* supabase-js sends x-client-info (and a version header) on every invoke;
     leaving them out makes the browser block the preflight and the caller
     sees only "Failed to send a request to the Edge Function". */
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  companyTagline?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in first" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const mailKey = Deno.env.get("MAIL_PROVIDER_API_KEY")?.trim();
  const from = Deno.env.get("MAIL_FROM")?.trim() ?? "";
  if (!url || !anon) return json(500, { error: "Function is not configured" });

  const { invitationId, appOrigin } = await req.json().catch(() => ({}));
  if (!invitationId) return json(400, { error: "invitationId is required" });

  /* The activation link's origin is PINNED server-side. The browser's origin
     is a hint, honoured only when it is on the allow-list — otherwise an
     invite sent from a dev tab would mail a teammate a localhost link (the
     invite-safety rule this exists for), and a tampered request could brand a
     BES email with a link to somewhere else entirely. */
  const configured = (Deno.env.get("APP_ORIGINS") ?? "https://app.bescrm.net")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const offered = typeof appOrigin === "string" ? appOrigin.replace(/\/$/, "") : "";
  const origin = configured.includes(offered) ? offered : configured[0];

  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: inv, error } = await asUser
    .from("invitations")
    .select("email, token, kind, organization_id, agency_role, partner_group_id, organizations(name, branding), outsourcing_groups(name), partner_contacts(full_name, is_primary), agencies(name, branding)")
    .eq("id", invitationId)
    .is("accepted_at", null)
    .maybeSingle();
  if (error) return json(403, { error: error.message });
  if (!inv) return json(404, { error: "Invitation not found or not yours to send" });
  if (!mailKey || !from) {
    return json(503, { error: "Email is not connected yet. Copy the invite link instead.", code: "not_connected" });
  }

  const org = inv.organizations as { name: string; branding: Branding | null } | null;
  const partner = inv.outsourcing_groups as { name: string } | null;
  /* The agency's OWN branding — the logo and colour configured under
     Agency & Branding — faces its team and its partners, exactly as an
     organization's branding faces its staff. Note the key difference: the
     agency records its strapline as `tagline`, organizations as
     `companyTagline`. */
  const agency = inv.agencies as { name: string; branding: (Branding & { tagline?: string }) | null } | null;
  const isTeam = inv.kind === "agency";
  /* A partner portal invitation is BES-branded: the partner is BES's customer,
     and the portal they are joining is BES's. */
  const isPartner = !!inv.partner_group_id;
  const branding = org?.branding ?? {};
  const agencyBranding = agency?.branding ?? {};
  const agencyName = agency?.name ?? "Blessed Empire Services";
  const brand: EmailBrand = isTeam || isPartner
    ? {
        name: agencyName,
        logoUrl: agencyBranding.logoUrl,
        primaryColor: agencyBranding.primaryColor,
        tagline: agencyBranding.tagline,
      }
    : {
        name: org?.name ?? "your organization",
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        tagline: branding.companyTagline,
      };

  const link = `${origin}/accept-invitation/${inv.token}`;

  /* Portal activation copy is Dee's, verbatim (2026-09-09): the partner's
     OWNER (the primary contact) is welcomed to THEIR portal; a partner TEAM
     MEMBER is invited into the partner's portal with a role-scoped promise.
     Both carry the growth-engine brand line and the company signature. */
  const contact = inv.partner_contacts as { full_name: string | null; is_primary: boolean | null } | null;
  const firstName = (contact?.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const partnerName = partner?.name ?? "your company";
  const email = String(inv.email);

  let subject: string;
  let content: Parameters<typeof sendEmail>[0]["content"];
  if (isPartner && contact?.is_primary) {
    subject = `Activate your BES Partner Portal`;
    content = {
      brand: { ...brand, tagline: "Beyond Outsourcing. Your Business Growth Engine." },
      heading: `Welcome, ${firstName}`,
      paragraphs: [
        "Your BES Partner Portal is ready.",
        `This is where you can stay connected with our team, access shared files, check updates, and keep track of the services we\u2019re supporting for ${partnerName}.`,
        `Activate your account using ${email} and you\u2019re good to go.`,
      ],
      action: { label: "Activate My Portal", url: link },
      security: [
        `This invitation is valid for 7 days and is intended only for ${email}.`,
        "If you did not expect this invitation, you may safely ignore this email.",
      ],
    };
  } else if (isPartner) {
    subject = `You have been invited to ${partnerName}\u2019s BES Partner Portal`;
    content = {
      brand: { ...brand, tagline: "Beyond Outsourcing. Your Business Growth Engine." },
      heading: `Hi ${firstName}, welcome`,
      paragraphs: [
        `You\u2019ve been invited to access ${partnerName}\u2019s BES Partner Portal.`,
        "This gives you access to the files, updates, resources, and areas your team has shared with you.",
        `Use ${email} to activate your account and get started.`,
        "You\u2019ll only see the areas connected to your role and access.",
      ],
      action: { label: "Activate My Access", url: link },
      security: [
        `This invitation is valid for 7 days and is intended only for ${email}.`,
        "If it expires, your administrator or the BES team can send a new one.",
        "If you did not expect this invitation, you may safely ignore this email.",
      ],
    };
  } else if (isTeam) {
    /* The BES team's OWN welcome (Dee, 2026-09-10): internal, and deliberately
       NOT the partner copy above. Somebody joining BES is joining the company,
       so the brand line is the company's own rather than the outsourcing
       promise a partner is sold. */
    subject = `Activate your ${agencyName} account`;
    content = {
      brand: { ...brand, tagline: "Freedom isn’t found, it’s built with structure." },
      heading: "Welcome to the team",
      paragraphs: [
        `You’ve been invited to join the ${agencyName} team.`,
        "This is where your work lives — the partners and clients you’re assigned to, your daily tasks, your time, and your end-of-day report, all in one place.",
        `Activate your account using ${email} and you’re all set.`,
      ],
      action: { label: "Activate My Account", url: link },
      security: [
        `This invitation is valid for 7 days and is intended only for ${email}.`,
        "If it expires, ask whoever invited you to send a new one.",
        "If you did not expect this invitation, you may safely ignore this email — no account is created until the link is opened.",
      ],
    };
  } else {
    /* A customer organization's own invitation: THEIR branding, neutral copy.
       Not BES's voice — the person joining is joining their company. */
    subject = `Activate your ${brand.name} account`;
    content = {
      brand,
      heading: `You have been invited to ${brand.name}`,
      paragraphs: [
        `Activate your account to get started. You will be asked to sign in with this email address — ${email} — and the invitation only works for that address.`,
      ],
      action: { label: "Activate my account", url: link },
      security: [
        `This invitation is valid for 7 days and is intended only for ${email}.`,
        "If you did not expect this invitation, you may safely ignore this email — no account is created until the link is opened.",
      ],
    };
  }

  const result = await sendEmail({
    replyTo: Deno.env.get("MAIL_REPLY_TO")?.trim() || undefined,
    apiKey: mailKey,
    from,
    fromName: brand.name,
    to: email,
    subject,
    content,
  });

  if (!result.ok) {
    /* The hint first, because it is the part somebody can act on; the
       provider's own words after it, because they are the evidence. */
    return json(502, {
      error: result.hint
        ? `${result.hint} (Provider said ${result.status}: ${result.detail ?? ""})`.trim()
        : `The email provider refused the message (${result.status}). ${result.detail ?? ""}`.trim(),
      code: result.status === 401 ? "bad_api_key" : result.status === 403 ? "sender_not_verified" : "provider_refused",
    });
  }
  return json(200, { sent: true });
});
