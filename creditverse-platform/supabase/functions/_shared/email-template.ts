/**
 * One branded email layout, shared by every function that sends mail.
 *
 * The brand is the *organization's* when the email is about their workspace —
 * their logo, their colour, their name — because that is who the person is
 * being invited to, and a BES-branded email would confuse a customer's staff
 * (rule 16: the customer's brand faces their people). BES's own colours are
 * the fallback and the brand for BES team invitations.
 *
 * Kept deliberately plain: a table-free single column, inline styles, no
 * external CSS and no web fonts. Email clients strip most of it anyway, and
 * anything that fails to load must still leave a readable message and a link.
 */

export interface EmailBrand {
  /** The organization's name, or "Blessed Empire Services" for BES itself. */
  name: string;
  logoUrl?: string | null;
  /** Hex, e.g. "#1423eb". Falls back to the BES green. */
  primaryColor?: string | null;
  tagline?: string | null;
}

const BES_GREEN = "#005F4B";
const SAFE_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Anything that is not a plain hex colour is ignored rather than injected. */
export function safeColor(value: string | null | undefined): string {
  return value && SAFE_HEX.test(value.trim()) ? value.trim() : BES_GREEN;
}

/** Only http(s) images; a data: or javascript: URL never reaches the markup. */
export function safeImage(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailContent {
  brand: EmailBrand;
  /** Shown large at the top of the message. */
  heading: string;
  /** One or two short paragraphs. Plain text; it is escaped. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Small print under the button — what to do if the button fails, etc. */
  footnote?: string;
}

/**
 * The HTML body. Every piece of caller-supplied text is escaped; only the
 * action URL is inserted raw, and callers build that from their own data,
 * never from anything a stranger typed.
 */
export function renderEmail(content: EmailContent): string {
  const colour = safeColor(content.brand.primaryColor);
  const logo = safeImage(content.brand.logoUrl);
  const name = escapeHtml(content.brand.name);
  const header = logo
    ? `<img src="${logo}" alt="${name}" width="120" style="max-width:120px;height:auto;display:block;margin:0 auto 8px" />`
    : `<div style="font-size:18px;font-weight:700;color:${colour};text-align:center;margin-bottom:8px">${name}</div>`;

  const body = content.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(p)}</p>`)
    .join("");

  const button = content.action
    ? `<p style="margin:24px 0">
         <a href="${content.action.url}"
            style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:15px">
           ${escapeHtml(content.action.label)}
         </a>
       </p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.6;color:#64748b">
         If the button does not work, copy this address into your browser:<br />
         <span style="word-break:break-all;color:#334155">${escapeHtml(content.action.url)}</span>
       </p>`
    : "";

  const footnote = content.footnote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b">${escapeHtml(content.footnote)}</p>`
    : "";

  const tagline = content.brand.tagline
    ? `<div style="font-size:12px;color:#64748b;text-align:center">${escapeHtml(content.brand.tagline)}</div>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
    <div style="height:4px;background:${colour}"></div>
    <div style="padding:28px">
      ${header}
      ${tagline}
      <h1 style="margin:20px 0 12px;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(content.heading)}</h1>
      ${body}
      ${button}
      ${footnote}
    </div>
  </div>
  <div style="max-width:560px;margin:12px auto 0;text-align:center;font-size:11px;color:#94a3b8">
    Sent by ${name}. If you were not expecting this, you can ignore it.
  </div>
</body></html>`;
}

/** The same message as plain text, for clients that will not render HTML. */
export function renderEmailText(content: EmailContent): string {
  const lines = [content.brand.name, "", content.heading, "", ...content.paragraphs];
  if (content.action) lines.push("", `${content.action.label}: ${content.action.url}`);
  if (content.footnote) lines.push("", content.footnote);
  lines.push("", `Sent by ${content.brand.name}. If you were not expecting this, you can ignore it.`);
  return lines.join("\n");
}

/** MAIL_FROM may be "Name <address>" or a bare address; this pulls them apart. */
export function parseFrom(raw: string, fallbackName: string): { email: string; name: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (match) return { email: match[2].trim(), name: match[1] || fallbackName };
  return { email: raw.trim(), name: fallbackName };
}

export interface SendResult {
  /** What an operator should do about it, when the status makes that clear. */
  hint?: string;
  ok: boolean;
  status: number;
  detail?: string;
}

/**
 * Resend's transactional API.
 *
 * The `from` address must be on a domain verified in the Resend account
 * (Domains → the DNS records they give you). When it is not, Resend refuses
 * the message and says why; that reason is handed back to the screen rather
 * than swallowed, because "the email did not go and here is why" is useful and
 * "sent!" when nothing was sent is not.
 *
 * Resend wants `from` as a single RFC-5322 string — "BES <no-reply@bes.com>" —
 * so the name and address are recombined here rather than sent apart.
 */
export async function sendEmail(params: {
  apiKey: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  content: EmailContent;
  /** A monitored mailbox for replies. Omitted when the caller has none. */
  replyTo?: string;
}): Promise<SendResult> {
  const from = parseFrom(params.from, params.fromName);
  const name = (params.fromName || from.name || "").replace(/["\\<>]/g, "").trim();
  /* A "no-reply" sender with nowhere to reply is both unhelpful to the person
     who hits Reply and a small negative deliverability signal. Callers pass a
     real monitored mailbox (MAIL_REPLY_TO in their environment); with none,
     the header is omitted rather than pointed at an address nobody reads. */
  const replyTo = params.replyTo?.trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: name ? `${name} <${from.email}>` : from.email,
      to: [params.to],
      subject: params.subject,
      html: renderEmail(params.content),
      text: renderEmailText(params.content),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const detail = await res.text().catch(() => "");
  /* The key itself is never logged — only the status and Resend's message. */
  console.error("resend error", res.status, detail.slice(0, 500));
  return { ok: false, status: res.status, detail: detail.slice(0, 200), hint: hintFor(res.status, detail) };
}

/**
 * What the provider's refusal actually means, for whoever has to fix it.
 *
 * The raw body — `{"statusCode":401,"name":"validation_error","message":"API
 * key is invalid"}` — is accurate and tells an operator nothing about what to
 * do. These two statuses have completely different causes and completely
 * different fixes, and confusing them wastes an afternoon: a 401 is the
 * credential, a 403 is almost always the sending domain.
 */
function hintFor(status: number, detail: string): string | undefined {
  const body = detail.toLowerCase();
  if (status === 401 || body.includes("api key is invalid")) {
    return (
      "The email provider rejected the API key itself, so nothing about this message was the problem. " +
      "Set a current Resend sending key: npx supabase secrets set MAIL_PROVIDER_API_KEY=re_… " +
      "Check it has not been revoked, that it belongs to the same Resend account as the verified " +
      "sending domain, and that no quotes or trailing spaces were included when it was set."
    );
  }
  if (status === 403 || body.includes("domain") || body.includes("not verified")) {
    return (
      "The key worked but the sending address was refused — usually a domain that is not verified. " +
      "Verify the domain in Resend → Domains, and make sure MAIL_FROM uses an address on it."
    );
  }
  if (status === 429) return "The provider is rate-limiting. Wait and try again.";
  return undefined;
}
