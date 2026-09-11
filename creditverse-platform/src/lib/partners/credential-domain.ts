/**
 * Rules about credentials that are not about storing them.
 *
 * Kept out of both the repository and the panel so the same judgements can be
 * made in a form, a list and a test without being restated (rules 5 and 13).
 */

/** How overdue a rotation is, as a single decision the interface can render. */
export type RotationState = "none" | "scheduled" | "due-soon" | "overdue";

const DAY = 86_400_000;
/** A week is enough warning to arrange a change without it becoming urgent. */
export const DUE_SOON_DAYS = 7;

export const rotationState = (
  rotationDueOn: string | null,
  today = new Date(),
): RotationState => {
  if (!rotationDueOn) return "none";
  const due = new Date(`${rotationDueOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return "none";
  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const days = Math.round((due.getTime() - midnight.getTime()) / DAY);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "scheduled";
};

export const ROTATION_LABEL: Record<RotationState, string> = {
  none: "No rotation date",
  scheduled: "Rotation scheduled",
  "due-soon": "Rotation due soon",
  overdue: "Rotation overdue",
};

/**
 * Does this free text look like somebody pasted a password into it?
 *
 * The same pattern the database enforces in `looks_like_a_secret`. It is
 * repeated here to warn while the person is still typing rather than only
 * refusing on save — the database remains the authority, and this copy exists
 * to be kind, not to be trusted. A change to one is a change to both;
 * `credential-domain.test.ts` holds them together.
 */
export const SECRET_PATTERN =
  /(pass\s*word|passcode|\bpwd\b|api[\s_-]?key|secret\s*key|bearer\s+[A-Za-z0-9._-]{12}|security\s*code)/i;

export const looksLikeASecret = (text: string | null | undefined): boolean =>
  SECRET_PATTERN.test(text ?? "");

/**
 * What a credential's link should be, ready for an anchor.
 *
 * A partner's spreadsheet says "app.disputefox.com" as often as it says the
 * full address; without a scheme the browser reads that as a relative path and
 * navigates inside BES. Anything that is not plainly http(s) is refused rather
 * than guessed — a `javascript:` URL in a partner note must never become a
 * link the team can click.
 */
export const credentialHref = (url: string | null): string | null => {
  const raw = url?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

/** Group credentials by platform, in catalogue order, for a readable list. */
export const byPlatform = <T extends { platformKey: string; label: string }>(
  credentials: readonly T[],
  order: readonly string[],
): { platformKey: string; items: T[] }[] => {
  const rank = new Map(order.map((k, i) => [k, i]));
  const groups = new Map<string, T[]>();
  for (const c of credentials) {
    const list = groups.get(c.platformKey);
    if (list) list.push(c);
    else groups.set(c.platformKey, [c]);
  }
  return [...groups.entries()]
    .sort(
      ([a], [b]) =>
        (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b),
    )
    .map(([platformKey, items]) => ({
      platformKey,
      items: items.sort((x, y) => x.label.localeCompare(y.label)),
    }));
};


/* ── Categories (0298): what KIND of system a login is ─────────────────────
   Dee's Partner Information sections, in her order. A platform carries a
   default category; the row carries the category that applies (GoHighLevel
   can be the CRM or the ESP — the row says which). */
export type CredentialCategory =
  | "crm" | "ghl" | "esp" | "credit_monitoring" | "affiliate" | "domain" | "other";

export const CREDENTIAL_CATEGORIES: { key: CredentialCategory; label: string; hint: string }[] = [
  { key: "crm", label: "Credit Repair CRM", hint: "DisputeFox, Credit Repair Cloud, Client Dispute Manager, DisputeBee…" },
  { key: "ghl", label: "GoHighLevel", hint: "The agency account or location BES works in" },
  { key: "esp", label: "Email / ESP", hint: "Google Workspace, Microsoft 365, Mailgun, SendGrid…" },
  { key: "credit_monitoring", label: "Credit Monitoring", hint: "SmartCredit, IdentityIQ, MyFreeScoreNow, Experian — and the affiliate link" },
  { key: "affiliate", label: "Affiliate Accounts", hint: "Any affiliate program BES may need for your account" },
  { key: "domain", label: "Domain", hint: "GoDaddy, Namecheap, Cloudflare, Squarespace, Wix…" },
  { key: "other", label: "Additional Systems", hint: "Any other platform BES needs access to" },
];

export const categoryLabel = (key: string): string =>
  CREDENTIAL_CATEGORIES.find((c) => c.key === key)?.label ?? "Additional Systems";

/** Group by category in Dee's order, then by platform order inside each. */
export const byCategory = <T extends { category: string; platformKey: string; label: string }>(
  credentials: readonly T[],
  platformOrder: readonly string[],
): { category: CredentialCategory; items: T[] }[] => {
  const rank = new Map(platformOrder.map((k, i) => [k, i]));
  const out: { category: CredentialCategory; items: T[] }[] = [];
  for (const cat of CREDENTIAL_CATEGORIES) {
    const items = credentials
      .filter((c) => c.category === cat.key)
      .sort((a, b) => (rank.get(a.platformKey) ?? 999) - (rank.get(b.platformKey) ?? 999) || a.label.localeCompare(b.label));
    if (items.length > 0) out.push({ category: cat.key, items });
  }
  return out;
};
