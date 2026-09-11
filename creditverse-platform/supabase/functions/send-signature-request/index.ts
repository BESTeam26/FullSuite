/**
 * Email a signature request: "Please sign {title}", with the signer's link.
 *
 * The request already exists and already holds the frozen snapshot; this only
 * carries the link. Creating and emailing are two steps for the same reason
 * invitations are: a mail provider that is down must never cost somebody the
 * request — the link is still there to copy.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailBrand } from "../_shared/email-template.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

interface Branding { logoUrl?: string | null; primaryColor?: string | null; tagline?: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailKey = Deno.env.get("MAIL_PROVIDER_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!url || !anon || !service) return json(500, { error: "Not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Sign in first" });

  let body: { requestId?: string; appOrigin?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.requestId) return json(400, { error: "requestId is required" });

  /* The caller must hold the capability — asked of the database with their
     own token, never trusted from the body. */
  const asUser = createClient(url, anon, { global: { headers: { authorization: authHeader } } });
  const { data: allowed } = await asUser.rpc("agency_can", { p_key: "documents.manage" });
  if (allowed !== true) return json(403, { error: "Document builder permission required" });

  const configured = (Deno.env.get("APP_ORIGINS") ?? "https://bes-full-suite.vercel.app")
    .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const offered = typeof body.appOrigin === "string" ? body.appOrigin.replace(/\/$/, "") : "";
  const origin = configured.includes(offered) ? offered : configured[0];

  const sb = createClient(url, service);
  const { data: r, error } = await sb
    .from("signature_requests")
    .select("id, title, token, signer_name, signer_email, status, expires_at, agencies(name, branding)")
    .eq("id", body.requestId)
    .maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!r) return json(404, { error: "Request not found" });
  if (!["sent", "viewed"].includes(r.status as string)) return json(409, { error: `This request is ${r.status}; nothing to send.` });
  if (!mailKey || !from) return json(503, { error: "Email is not connected yet. Copy the signing link instead.", code: "not_connected" });

  const agency = r.agencies as { name: string; branding: Branding | null } | null;
  const brand: EmailBrand = {
    name: agency?.name ?? "Blessed Empire Services",
    logoUrl: agency?.branding?.logoUrl,
    primaryColor: agency?.branding?.primaryColor,
    tagline: agency?.branding?.tagline ?? "Beyond Outsourcing. Your Business Growth Engine.",
  };
  const firstName = String(r.signer_name ?? "").trim().split(/\s+/)[0] || "there";
  const link = `${origin}/sign/${r.token}`;
  const expires = new Date(r.expires_at as string).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const result = await sendEmail({
    replyTo: Deno.env.get("MAIL_REPLY_TO")?.trim() || undefined,
    apiKey: mailKey,
    from,
    fromName: brand.name,
    to: String(r.signer_email),
    subject: `Please sign: ${r.title}`,
    content: {
      brand,
      heading: `Hi ${firstName}, a document is waiting for your signature`,
      paragraphs: [
        `${brand.name} has sent you "${r.title}" to review and sign. Open it, read it through, type your full name, and you are done — no account or printing needed.`,
        `This link is only for ${r.signer_email} and stays valid until ${expires}. If it expires, ask the sender for a new one.`,
      ],
      action: { label: "Review and sign", url: link },
      footnote: `${brand.name} · Process. Systems. People. If you were not expecting this document, you can ignore this email; nothing is signed until you sign it.`,
    },
  });

  if (!result.ok) {
    return json(502, {
      error: result.hint ? `${result.hint} (Provider said ${result.status}: ${result.detail ?? ""})`.trim()
        : `The email provider refused the message (${result.status}). ${result.detail ?? ""}`.trim(),
    });
  }
  return json(200, { sent: true });
});
