/**
 * Reading a BES client out of a ClickUp card.
 *
 * ── WHY THIS IS A PURE MODULE WITH ITS OWN TESTS ───────────────────────────
 *
 * Everything else in the import is mechanical — upsert a row, call a function.
 * This is the part that GUESSES, because ClickUp never had fields for most of
 * it: an SSN, a date of birth, a monitoring password and a home address were
 * all typed into a free-text card in whatever shape the person felt like that
 * day. A parser that is subtly wrong writes a plausible, wrong SSN into a
 * vault and nobody notices.
 *
 * So it is pure text in, structure out, no network and no database, and it is
 * tested against the real cards from the pilot list rather than invented ones.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 *
 * It does not normalise an SSN it cannot read, invent a round, or turn a
 * missing value into a default. Anything it is unsure of comes back in
 * `needsReview` with the reason, because an import that quietly fills gaps is
 * how bad data becomes permanent.
 */

export interface ParsedCredential {
  provider: string;
  username: string | null;
  secret: string;
  /** Where in the card it was found, for provenance. */
  source: string;
}

export interface ParsedClient {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** ISO date, or null. Never a guess. */
  dateOfBirth: string | null;
  /** Digits only, exactly 9, or null. */
  ssn: string | null;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
  breachEquifax: boolean | null;
  breachNpd: boolean | null;
  /** The id this person had in the previous system. */
  legacyClientId: string | null;
  /** ISO date the programme began, from the legacy paste. */
  startedOn: string | null;
  credentials: ParsedCredential[];
  /** Free-text worth keeping — open accounts, reference numbers, headers. */
  notes: string[];
  /** Reasons a human should look, each one specific. */
  needsReview: string[];
}

const MONTHS = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;

/** US m/d/yyyy → ISO. Refuses anything it cannot read unambiguously. */
export function parseUsDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = MONTHS.exec(raw.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  /* Round-trip, so 02/31 is rejected rather than rolled into March. */
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Nine digits, however they were punctuated. Anything else is not an SSN. */
export function parseSsn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const looksLikeFile = (line: string) => /\.(png|jpe?g|pdf|gif|webp|heic|docx?|xlsx?|csv)$/i.test(line.trim());

/** A comment that is only a list of filenames is an upload receipt, not a note. */
export function isAttachmentReceipt(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(looksLikeFile);
}

/** ClickUp's own automation, which is not BES history. */
export function isAutomationNoise(authorId: number | null | undefined, text: string): boolean {
  if (authorId === -1) return true;
  return /@assignees\b/.test(text) && /must be (completed|processed)/i.test(text);
}

/**
 * Replace every secret with a marker, for the copy that goes on the timeline.
 *
 * The values still go to the vault; this is what a person reads. Same
 * discipline as the partner card import (0263/0264): a note is stored in the
 * clear and read without audit, so it must not carry the thing the vault
 * exists to protect.
 */
export function scrubSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 4) continue;
    out = out.split(s).join("[secret — see the client's Identity & Access panel]");
  }
  /* SSNs, whether or not they were captured as a field. */
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN — see the client's Identity & Access panel]");
  out = out.replace(/(SSN\s*:\s*)(\d{9})\b/gi, "$1[SSN — see the client's Identity & Access panel]");
  return out;
}

const CRED_HEADERS: { re: RegExp; provider: string }[] = [
  { re: /^(NEW\s+)?MFSN\b/i, provider: "MyFreeScoreNow" },
  { re: /^CREATED\s+CFPB\s+LOGINS?\b/i, provider: "CFPB" },
  { re: /^IDENTITY\s*IQ\b/i, provider: "IdentityIQ" },
  { re: /^SMART\s*CREDIT\b/i, provider: "SmartCredit" },
];

/**
 * Read one card — a description or a comment — into structure.
 *
 * `label` names where it came from, so provenance survives into the result.
 */
export function parseClientCard(text: string, label: string): ParsedClient {
  const result: ParsedClient = {
    fullName: null, firstName: null, lastName: null, email: null, phone: null,
    dateOfBirth: null, ssn: null, address: null,
    breachEquifax: null, breachNpd: null, legacyClientId: null, startedOn: null,
    credentials: [], notes: [], needsReview: [],
  };
  const lines = text.split("\n").map((l) => l.replace(/\r/g, "").trim());

  /* A credential block is a header line followed by up to two lines that are
     not themselves a labelled field. That shape is the whole convention — BES
     never had a field for these. */
  const consumed = new Set<number>();
  lines.forEach((line, i) => {
    const header = CRED_HEADERS.find((h) => h.re.test(line));
    if (!header) return;
    const rest: string[] = [];
    for (let j = i + 1; j < lines.length && rest.length < 2; j++) {
      const next = lines[j];
      if (!next) { if (rest.length) break; else continue; }
      if (/^[A-Za-z ]{2,24}:/.test(next) || CRED_HEADERS.some((h) => h.re.test(next))) break;
      rest.push(next);
      consumed.add(j);
    }
    if (rest.length === 0) return;
    const username = rest.length > 1 ? rest[0] : null;
    const secret = rest[rest.length - 1];
    if (rest.length === 1) {
      result.needsReview.push(`${header.provider} login in ${label} has one line only — cannot tell username from password`);
      return;
    }
    consumed.add(i);
    result.credentials.push({ provider: header.provider, username, secret, source: label });
  });

  const addressCandidates: string[] = [];
  lines.forEach((line, i) => {
    if (!line || consumed.has(i)) return;
    const field = /^([A-Za-z ]{2,28})\s*:\s*(.*)$/.exec(line);
    const key = field ? field[1].trim().toLowerCase() : null;
    const value = field ? field[2].trim() : null;

    if (key === "ssn") {
      const ssn = parseSsn(value);
      if (ssn) result.ssn = ssn;
      else if (value) result.needsReview.push(`SSN in ${label} is not nine digits`);
      return;
    }
    if (key === "dob") {
      const dob = parseUsDate(value);
      if (dob) result.dateOfBirth = dob;
      else if (value) result.needsReview.push(`Date of birth in ${label} could not be read: "${value}"`);
      return;
    }
    if (key === "cell" || key === "sms" || key === "phone" || key === "home") {
      if (value && !result.phone) result.phone = value;
      return;
    }
    if (key === "email") {
      const m = EMAIL_RE.exec(value ?? "");
      if (m) result.email = m[0];
      return;
    }
    if (key === "id") { if (value) result.legacyClientId = value; return; }
    if (key === "started" || key === "created") {
      const d = parseUsDate(value);
      if (d && !result.startedOn) result.startedOn = d;
      return;
    }
    if (key === "equifax data breach") { result.breachEquifax = /^y/i.test(value ?? ""); return; }
    if (key === "npd data breach") { result.breachNpd = /^y/i.test(value ?? ""); return; }
    if (key === "latest email sent status") return;

    /* A bare email on its own line is the address, not a note. */
    if (!field && EMAIL_RE.test(line) && line.split(/\s+/).length === 1) {
      if (!result.email) result.email = EMAIL_RE.exec(line)![0];
      return;
    }

    /* The first line is the person, when it is not a section header. */
    if (i === 0 && !field) {
      const name = line.replace(/\s*[-–]\s*R\d+\s*$/i, "").trim();
      if (name && !/^(SWEEP|OPEN ACCOUNTS)$/i.test(name)) result.fullName = name;
      else if (name) result.notes.push(line);
      return;
    }

    if (!field) {
      /* Address lines sit between the name and the first labelled field. */
      if (addressCandidates.length < 2 && result.ssn === null && result.dateOfBirth === null
          && !/^(OPEN ACCOUNTS|SWEEP|CLOSED|CHARGE-OFF|COLLECTION)/i.test(line)) {
        addressCandidates.push(line);
        return;
      }
      if (line.toLowerCase() !== "undefined") result.notes.push(line);
    }
  });

  if (result.fullName) {
    const parts = result.fullName.split(/\s+/);
    result.firstName = parts[0] ?? null;
    result.lastName = parts.slice(1).join(" ") || null;
  }

  if (addressCandidates.length > 0) {
    const last = addressCandidates[addressCandidates.length - 1];
    /* "Miami, Florida 33186" or "MIAMI, FL 33193-1481" */
    const m = /^(.*?),\s*([A-Za-z ]{2,20})\s+(\d{5}(?:-\d{4})?)$/.exec(last);
    result.address = {
      line1: addressCandidates.length > 1 ? addressCandidates[0] : (m ? null : last),
      city: m ? m[1].trim() : null,
      state: m ? normaliseState(m[2].trim()) : null,
      postalCode: m ? m[3] : null,
    };
    if (!m) result.needsReview.push(`Address in ${label} has no readable city/state/ZIP line`);
  }

  return result;
}

const STATES: Record<string, string> = {
  florida: "FL", georgia: "GA", texas: "TX", california: "CA", newyork: "NY",
  newjersey: "NJ", pennsylvania: "PA", illinois: "IL", ohio: "OH", michigan: "MI",
  northcarolina: "NC", southcarolina: "SC", virginia: "VA", maryland: "MD",
  massachusetts: "MA", arizona: "AZ", nevada: "NV", colorado: "CO", tennessee: "TN",
  alabama: "AL", louisiana: "LA", missouri: "MO", indiana: "IN", washington: "WA",
};

/** Full state names to their two-letter code; anything already short passes. */
export function normaliseState(raw: string): string {
  const t = raw.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATES[t.toLowerCase().replace(/\s+/g, "")] ?? t;
}

/**
 * Merge what the description says with what the comments say.
 *
 * The DESCRIPTION WINS on anything both carry — Dee's ruling on Bryan, who has
 * one address on his card and an older one in a comment. Comments fill gaps
 * the description left, which is where the legacy ids and half the monitoring
 * logins actually live.
 */
export function mergeCards(description: ParsedClient, comments: ParsedClient[]): ParsedClient {
  const merged: ParsedClient = { ...description, credentials: [...description.credentials],
    notes: [...description.notes], needsReview: [...description.needsReview] };

  for (const c of comments) {
    for (const key of ["fullName", "firstName", "lastName", "email", "phone", "dateOfBirth",
                       "ssn", "legacyClientId", "startedOn"] as const) {
      if (merged[key] === null && c[key] !== null) (merged[key] as unknown) = c[key];
    }
    if (merged.breachEquifax === null && c.breachEquifax !== null) merged.breachEquifax = c.breachEquifax;
    if (merged.breachNpd === null && c.breachNpd !== null) merged.breachNpd = c.breachNpd;
    if (merged.address === null && c.address !== null) merged.address = c.address;

    for (const cred of c.credentials) {
      const already = merged.credentials.find((x) => x.provider === cred.provider);
      if (!already) merged.credentials.push(cred);
      else if (already.secret !== cred.secret) {
        /* Two different passwords for one provider is a real question, not a
           thing to resolve by taking the newest and hoping. */
        merged.needsReview.push(`Two different ${cred.provider} passwords found (${already.source} and ${cred.source})`);
      }
    }
    merged.notes.push(...c.notes);
    merged.needsReview.push(...c.needsReview);
  }

  merged.notes = [...new Set(merged.notes)];
  merged.needsReview = [...new Set(merged.needsReview)];
  return merged;
}
