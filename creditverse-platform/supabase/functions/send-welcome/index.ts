/**
 * The welcome email a new organization gets once its workspace exists.
 *
 * Deliberately *not* the sign-up confirmation — that one is sent by Supabase
 * Auth over SMTP and is what proves the address. This is the email after the
 * workspace has actually been created, so it can say what the person now has
 * and what to do first.
 *
 * Sent at most once per organization: `organizations.welcome_email_sent_at` is
 * stamped in the same breath, and a second call sees the stamp and does
 * nothing. The caller is the app on first sign-in, so nothing is sent to a
 * business that never came back to confirm.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailBrand } from "../_shared/email-template.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
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
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailKey = Deno.env.get("MAIL_PROVIDER_API_KEY")?.trim();
  const from = Deno.env.get("MAIL_FROM")?.trim() ?? "";
  if (!url || !anon || !service) return json(500, { error: "Function is not configured" });

  const { organizationId, appOrigin } = await req.json().catch(() => ({}));
  if (!organizationId) return json(400, { error: "organizationId is required" });

  /* Same pinning as send-invitation: a mailed link never points at a dev
     origin or anywhere off the allow-list. */
  const configured = (Deno.env.get("APP_ORIGINS") ?? "https://app.bescrm.net")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const offered = typeof appOrigin === "string" ? appOrigin.replace(/\/$/, "") : "";
  const origin = configured.includes(offered) ? offered : configured[0];

  /* As the caller: they must be able to see this organization at all, which
     row-level security decides. A stranger cannot make us email someone. */
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json(401, { error: "Session not valid" });

  const { data: org, error } = await asUser
    .from("organizations")
    .select("id, name, branding, principal_email, welcome_email_sent_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) return json(403, { error: error.message });
  if (!org) return json(404, { error: "Organization not found" });
  if (org.welcome_email_sent_at) return json(200, { sent: false, reason: "already_sent" });
  if (!mailKey || !from) return json(503, { error: "Email is not connected yet.", code: "not_connected" });

  const branding = (org.branding ?? {}) as Branding;
  const brand: EmailBrand = {
    name: org.name,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    tagline: branding.companyTagline,
  };

  const result = await sendEmail({
    replyTo: Deno.env.get("MAIL_REPLY_TO")?.trim() || undefined,
    apiKey: mailKey,
    from,
    fromName: brand.name,
    to: String(org.principal_email),
    subject: `${org.name} is ready`,
    content: {
      brand,
      heading: `Welcome — ${org.name} is set up`,
      paragraphs: [
        "Your workspace is ready. Your trial has started, and no card was asked for.",
        "The quickest way in: add your logo and colour, invite the people who will work with you, then add your first client and import their credit report. The Getting started card on your home page walks through it and disappears once you are done.",
      ],
      action: { label: "Open your workspace", url: `${origin}/app` },
      security: [
        /* Not a credential email — nothing here grants access — so the
           closing is the one thing a new customer needs: how to reach a
           person. The structure stays identical to every other message. */
        "Anything you need, reply to this email and it reaches the BES team.",
      ],
    },
  });

  if (!result.ok) {
    return json(502, {
      error: result.hint
        ? `${result.hint} (Provider said ${result.status}: ${result.detail ?? ""})`.trim()
        : `The email provider refused the message (${result.status}). ${result.detail ?? ""}`.trim(),
      code: result.status === 401 ? "bad_api_key" : result.status === 403 ? "sender_not_verified" : "provider_refused",
    });
  }

  /* Stamped with the service role: the mark belongs to the platform, not to
     the person who happened to sign in first, and it must not be forgeable. */
  const asService = createClient(url, service);
  await asService
    .from("organizations")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", organizationId)
    .is("welcome_email_sent_at", null);

  return json(200, { sent: true });
});
