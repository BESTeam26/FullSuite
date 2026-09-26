/**
 * One colour for every CreditOps status, everywhere it appears.
 *
 * Dee, 2026-09-26: "Right now too many statuses visually look the same. I want
 * agents to be able to quickly scan the table and understand where every
 * client is."
 *
 * She was right about the cause. The old map named NINE statuses; the credit
 * vocabulary has about sixty and the department vocabularies another forty, so
 * everything else rendered as the same grey pill. A colour scheme that covers
 * a seventh of the values is not a colour scheme.
 *
 * ── CLASSIFIED BY MEANING, NOT LISTED BY NAME ─────────────────────────────
 *
 * A hand-written list of a hundred statuses is a list that goes stale: Dee's
 * vocabulary has changed four times this month — BC and CM spelled out,
 * Complaints gaining FOR COMPLAINTS / CFPB NEEDED / FTC NEEDED, the rounds
 * becoming "Round N Sent" — and each time a name changed, a hand-written
 * entry would have silently fallen back to grey.
 *
 * So this classifies by what a status MEANS, with an explicit table only for
 * the ones whose words do not give them away. A status nobody has written a
 * rule for still lands in a sensible family, and a renamed one keeps its
 * colour.
 *
 * ── THE FAMILIES ARE DEE'S ────────────────────────────────────────────────
 *
 *   onboarding     light blue    new client, onboarding, docs
 *   ready          strong blue   ready to be worked
 *   processing     purple        being worked now
 *   support        orange        routine support work
 *   waiting        grey          waiting on a bureau or a third party
 *   clientAction   yellow        waiting on the CLIENT
 *   complaints     pink/red      complaints work
 *   mailing        amber/brown   letters going out
 *   done           green         completed, graduated
 *   closed         dark grey     cancelled, inactive, archived, unworkable
 *   attention      red           blocked but ours to fix: any ISSUE,
 *                               incomplete, escalation, billing, unworkable
 *
 * ── AND ONLY THE STATUS SHOUTS ────────────────────────────────────────────
 *
 * Dee: "don't make everything colorful. Status should remain the strongest
 * color signal on each row." So the department chip uses the same hue at a
 * tenth of the strength — related enough to scan, quiet enough not to compete.
 *
 * Nothing here touches a status NAME, the routing, the automation or a stored
 * value. It decides one thing: what colour a word is painted.
 */

export type StatusFamily =
  | "onboarding"
  | "ready"
  | "processing"
  | "support"
  | "waiting"
  | "clientAction"
  | "complaints"
  | "mailing"
  | "done"
  | "closed"
  | "attention"
  | "neutral";

/**
 * The pill, and the quieter chip for a department.
 *
 * Solid backgrounds, because Dee asked for ClickUp's strength — a 10% tint of
 * eleven different hues is eleven shades of pale. Each foreground is chosen
 * against its own background rather than assumed: white fails on amber, so
 * the yellow families carry near-black text (rule 15).
 */
interface Tone {
  /** The status pill: solid, readable, unmistakable at a glance. */
  pill: string;
  /** The department chip: same hue, a tenth of the volume. */
  chip: string;
}

export const FAMILY_TONES: Record<StatusFamily, Tone> = {
  /* Dee's "light blue", and light on purpose: a solid sky next to a solid
     blue is the collision she reported, two states that look alike until you
     read the words. Light against solid is the clearest separation there is. */
  onboarding:   { pill: "bg-sky-100 text-sky-900 border-sky-400",
                  chip: "bg-sky-500/10 text-sky-800 border-sky-500/30" },
  ready:        { pill: "bg-blue-600 text-white border-blue-700",
                  chip: "bg-blue-600/10 text-blue-700 border-blue-600/30" },
  processing:   { pill: "bg-violet-600 text-white border-violet-700",
                  chip: "bg-violet-600/10 text-violet-700 border-violet-600/30" },
  /* Light, so it cannot be mistaken for Complaints: a solid orange dark
     enough to carry white text is very close to rose, and Support and
     Complaints are the two a Support agent must tell apart at a glance. */
  support:      { pill: "bg-orange-100 text-orange-900 border-orange-400",
                  chip: "bg-orange-500/10 text-orange-800 border-orange-500/30" },
  /* The largest group by far — every Round N Sent. Light grey on purpose:
     these are the rows the queue doctrine says nobody should be picking up,
     so they recede rather than compete. */
  waiting:      { pill: "bg-slate-200 text-slate-800 border-slate-400",
                  chip: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  /* Yellow, and the one bright light pill: somebody has to chase this. */
  clientAction: { pill: "bg-amber-400 text-amber-950 border-amber-500",
                  chip: "bg-amber-400/15 text-amber-800 border-amber-400/40" },
  /* Pink rather than red, because Attention is red and the two sat a shade
     apart. Dee's own wording is "Complaints = red/pink"; pink is the half of
     that which does not collide with a billing issue. */
  complaints:   { pill: "bg-pink-600 text-white border-pink-700",
                  chip: "bg-pink-600/10 text-pink-700 border-pink-600/30" },
  mailing:      { pill: "bg-amber-700 text-white border-amber-800",
                  chip: "bg-amber-700/10 text-amber-800 border-amber-700/30" },
  done:         { pill: "bg-emerald-700 text-white border-emerald-800",
                  chip: "bg-emerald-700/10 text-emerald-700 border-emerald-700/30" },
  closed:       { pill: "bg-slate-600 text-white border-slate-700",
                  chip: "bg-slate-600/10 text-slate-600 border-slate-600/30" },
  /* rose, NOT red. `tailwind.config.ts` redefines `red` as a single colour
     with no shades, so `bg-red-600` is not a class that exists: it was purged
     from the build while `text-white` survived, and Dee got white text on a
     white pill. See the palette test — this is the kind of mistake that
     looks fine in the source and only appears on screen. */
  attention:    { pill: "bg-rose-700 text-white border-rose-800",
                  chip: "bg-rose-700/10 text-rose-700 border-rose-700/30" },
  neutral:      { pill: "bg-muted text-foreground border-border",
                  chip: "bg-muted text-muted-foreground border-border" },
};

/**
 * The hex behind each background token above, and the contrast floor.
 *
 * Rule 15 is not satisfied by "it looks fine on my screen". White on
 * `sky-500` is about 2.9:1 and on `slate-400` about 2.3:1 — both well under
 * the 4.5:1 that 11px text needs, and both were in the first draft of this
 * palette. Rather than remember that, the test MEASURES it, which is why the
 * values live here beside the tones they belong to.
 *
 * A shade number is a poor proxy for brightness: `slate-500` is darker than
 * `sky-500` at the same number, because slate is desaturated. Measuring the
 * colour catches what counting the token cannot.
 */
export const TOKEN_HEX: Record<string, string> = {
  "sky-100": "#e0f2fe",
  "sky-900": "#0c4a6e",
  "orange-100": "#ffedd5",
  "orange-900": "#7c2d12",
  "slate-200": "#e2e8f0",
  "slate-800": "#1e293b",
  "blue-600": "#2563eb",
  "violet-600": "#7c3aed",
  "slate-600": "#475569",
  "amber-400": "#facc15",
  "amber-700": "#b45309",
  "amber-950": "#451a03",
  "pink-600": "#db2777",
  "emerald-700": "#047857",
  "rose-700": "#be123c",
};

/** WCAG AA for text below 18px. */
export const MIN_CONTRAST = 4.5;

/**
 * Statuses whose words do not give away what they mean.
 *
 * Kept deliberately short. Everything that CAN be classified by its wording
 * is, below — a name in this table is a name that has to be maintained.
 */
const EXPLICIT: Record<string, StatusFamily> = {
  "in dispute": "processing",
  "in dispute mailed": "waiting",
  "attention": "attention",
  /* Dee, 2026-09-26: *"NON WORKABLE … must be red."* It is not a file that
     quietly closed itself — it is one somebody has to look at and decide
     about, which is the opposite of the dark grey it started in. The words
     alone would not say so, which is why it is named here. */
  "non workable": "attention",
  "outsourcing - unpaid": "attention",
  "partner endorsed": "done",
  "access verified": "onboarding",
  /* Onboarding's DONE state, whose words say "ready" — it is in
     `CLOSED_DEPARTMENT_STATUSES`, meaning that department has nothing left to
     do. The pre-2026-09-22 spelling is here too, so old rows keep the colour. */
  "onboarding ready for round 1": "done",
  "ob ready for r1": "done",
  "docs pending": "clientAction",
  "prio processing": "processing",
  "graduated": "done",

  /* Generic work labels that used to live in a second table inside
     DivisionLayout. They are here so the word "Completed" cannot be green in
     one list and grey in another (Dee: "the same status must always have the
     same color everywhere it appears"). */
  "active": "done",
  "healthy": "done",
  "queued": "ready",
  "draft": "neutral",
  "funded": "done",
  "submitted": "waiting",
  "offer": "processing",
  "review": "processing",
};

/**
 * Ordered: the first rule that matches wins, so the specific precede the vague.
 *
 * The order is not cosmetic and it is not arbitrary. "COMPLAINT COMPLETED" and
 * "BUREAU CALLING COMPLETED" are FINISHED, not complaints work and not mailing
 * work, so `done` has to be reached before either — the status-colours test
 * caught exactly that by checking the palette against
 * `CLOSED_DEPARTMENT_STATUSES` rather than against a list of examples.
 */
const RULES: { family: StatusFamily; test: RegExp }[] = [
  /* On fire, before anything else can claim them. */
  /* BLOCKED, BUT SOMEBODY HAS TO ACT.
     Dee, 2026-09-26: *"use red for Non workable status BUT ACTIONAble like
     monitoring issue and incomplete onboarding."*

     That is the family, and it is a real distinction rather than a list: the
     file cannot move forward as it stands AND it is BES's to resolve. It is
     not "waiting" — nobody is coming back to us — and it is not routine
     support work. INCOMPLETE ONBOARDING sat in the onboarding family's light
     blue, which reads as a file progressing normally; it is a file stuck. */
  { family: "attention",    test: /escalat|issue|incomplete|unpaid|at risk|blocked/ },

  /* Waiting on the CLIENT — Dee's doctrine separates this from waiting on a
     bureau, and the two must not look alike: only one of them has somebody to
     chase. */
  { family: "clientAction", test: /client confirmation|waiting (on|client)|client response|docs pending|no cfpb login/ },

  /* Waiting on somebody else entirely. "Round sent" lives here: a round in
     the post is not work, whatever the queue looks like (§23). */
  { family: "waiting",      test: /awaiting|round \d+ sent|round sent|waiting|partner approval|partner confirmation/ },

  /* Finished, and closed for good — both BEFORE the department words below,
     so a completed complaint reads as completed rather than as a complaint. */
  /* `\bcomplete\b`, not `complete\b`: the second matches INCOMPLETE
     ONBOARDING, which is the opposite of done. */
  { family: "done",         test: /graduated|completed|\bcomplete\b|resolved|endorsed|not needed/ },
  { family: "closed",       test: /archived|inactive|canceled|cancelled|do not work|non workable|suspended/ },

  /* Complaints work that is still open. */
  { family: "complaints",   test: /complaint|cfpb|ftc|bbb|\bag filed\b/ },

  /* Reaching out to the bureaus — letters in the post, and the calling
     department. Dee's scheme says "In Progress = purple", but splitting
     BUREAU CALLING IN PROGRESS from BUREAU CALLING NEEDED would break one
     department across two colours for no gain; outbound contact is the family
     they both belong to. */
  { family: "mailing",      test: /letters|mailing|mailed|bureau calling/ },

  /* Support and monitoring. */
  { family: "support",      test: /support|monitoring/ },

  /* Queued to be worked — BEFORE `processing`, because Dee's scheme separates
     "Ready for Processing = stronger blue" from "Processing / In Progress =
     purple", and the word "processing" appears in both. Waiting to start and
     being worked are different answers to "does this need me now". */
  { family: "ready",        test: /ready/ },

  /* Being worked now. */
  { family: "processing",   test: /processing|in progress|dispute|qa\b|reimport|credit review|credit update/ },

  /* The beginning. */
  { family: "onboarding",   test: /onboarding|new client|new\b|intake/ },
];

/** Which family a status belongs to. Never throws; unknown means neutral. */
export function familyOf(status: string | null | undefined): StatusFamily {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  const explicit = EXPLICIT[s];
  if (explicit) return explicit;
  for (const rule of RULES) if (rule.test.test(s)) return rule.family;
  return "neutral";
}

/** The pill classes for a status — the strong signal on a row. */
export const statusPillTone = (status: string | null | undefined): string =>
  FAMILY_TONES[familyOf(status)].pill;

/** The quieter chip classes — departments and work sub-statuses. */
export const statusChipTone = (status: string | null | undefined): string =>
  FAMILY_TONES[familyOf(status)].chip;
