/**
 * Import a ClickUp client list into BES.
 *
 * ── WHY THE TOKEN LIVES HERE AND THE RULES DO NOT ──────────────────────────
 *
 * This function holds two things: the ClickUp token, and the parser. It holds
 * no authorization, no idempotency and no audit — those are
 * `clickup_import_client`, in the database, where every other write in this
 * system decides them. A TypeScript importer with its own opinions about who
 * may write what would be a second rulebook, and the second one drifts.
 *
 * ── WHY IT FETCHES INSTEAD OF BEING FED ────────────────────────────────────
 *
 * Dee: "Do not stage SSNs/passwords in temp files. Fetch in memory and write
 * directly to the secure client secret functions." A ClickUp card carries a
 * full SSN and a monitoring password in free text. Anything that copies them
 * into a file, a script or a chat message is another place they exist. Here
 * they are read from the API, parsed, handed to the vault, and dropped.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 *
 * It does not decide who may run it — it forwards the caller's own token, so
 * the database answers with the same rules a browser would meet. It does not
 * invent an email, a round or a date. It does not import ClickUp's own
 * automation comments, or the upload receipts that repeat what an attachment
 * record already says.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isAttachmentReceipt,
  isAutomationNoise,
  mergeCards,
  parseClientCard,
  scrubSecrets,
  type ParsedClient,
} from "../_shared/clickup-clients.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const CU = "https://api.clickup.com/api/v2";

interface CuComment { id: string; comment_text: string; user?: { id: number; username: string }; date: string }
interface CuAttachment { id: string; title: string; extension: string; mimetype: string; size: number; date: string; url?: string }

/**
 * ClickUp's status strings → the canonical BES client status.
 *
 * ── WHY THERE IS NO DEPARTMENT COLUMN HERE ANY MORE ────────────────────────
 *
 * There was one, and it had drifted. It named departments and queue names
 * ("Mailed", "Priority", "Follow up") that no department vocabulary has ever
 * contained, and two client statuses — "On Hold (Non Workable)" and
 * "Archived" — that are not in the enum at all, so those cards would have
 * been refused on write.
 *
 * It was also a second copy of a decision the database already owns.
 * `creditops_status_routing` says, for every client status, which department
 * opens and in what state, and the routing trigger applies it on insert. So
 * the import sets the status and lets routing do its job (rules 2 and 5).
 *
 * The one exception is below: three ClickUp statuses are MORE specific than
 * the client status can express, and their department state is set
 * explicitly rather than thrown away.
 */
const STATUS_MAP: Record<string, string> = {
  "process r1":              "Ready for Round 1",
  "ready for processing":    "Ready for Processing",
  "processing prio":         "Prio Processing",
  "indispute - mailed":      "In Dispute Mailed",
  "editing & mailing":       "LETTERS PENDING",
  "for complaints":          "For Complaints",
  /* "needed" is not "filed" — the action is still outstanding (Dee). */
  "ftc needed":              "For Complaints",
  "for cfpb only":           "For Complaints",
  "onboarding follow up":    "ONBOARDING FOLLOWUP",
  "incomplete onboarding":   "Incomplete Onboarding",
  "for client confirmation": "For Client Confirmation",
  "1 monitoring issue":      "Monitoring Issue 1",
  "2 monitoring issue":      "Monitoring Issue 2",
  "3 monitoring issue":      "Monitoring Issue 3",
  /* Dee, 2026-09-23, asked what "workforce audit" means: "that is READY FOR
     CREDIT REVIEW". Routing sends it to Support · READY FOR REIMPORT. */
  "workforce audit":         "Ready for Credit Review",
  "waiting for payment!":    "Outsourcing - Unpaid",
  "suspended":               "Non Workable",
  "do not work":             "Non Workable",
  "canceled/inactive/":      "Inactive / Canceled",
  "completed/ graduated":    "Graduated",
  /* Both were unmapped and therefore fell to "New Client", which routes to
     Onboarding · INCOMPLETE ONBOARDING — so eight finished EDP files landed
     in the Onboarding queue as new work and inflated its badge. ClickUp
     groups both with its DONE statuses; neither opens a department here.
     
     "Endorsed to client" is the file handed back to the partner, and
     "Program Completed" is the canonical end-state that opens nothing. The
     autoclosed CFPB complaint is a Complaints outcome, so it closes there.
     
     Named, not guessed at import time: an unmapped status is still reported
     by name, and that report is what found these two. */
  "endorsed to client":      "Program Completed",
  /* BES does not have the client's CFPB portal login, so no complaint can be
     filed until they hand it over. That is waiting on the CLIENT, which is
     exactly what "For Client Confirmation" is for in Dee's doctrine — it
     routes to Support · WAITING ON CLIENT, out of the actionable queue and
     into the state the client portal is built to resolve. Unmapped, it fell
     to "New Client" and three BMF files queued as new onboarding work. */
  "no cfpb login":           "For Client Confirmation",
  "cfpb (autoclosed)":       "COMPLAINT COMPLETED",
};

/**
 * Where ClickUp knows more than the client status does.
 *
 * "For Complaints", "FTC needed" and "CFPB only" are one client status and
 * three different pieces of work. Routing opens Complaints on FOR COMPLAINTS
 * for all three; these say which one it actually is, and the import writes
 * that over the routed row.
 */
const DEPARTMENT_OVERRIDE: Record<string, { department: string; status: string }> = {
  "for complaints": { department: "Complaints", status: "FOR COMPLAINTS" },
  "ftc needed":     { department: "Complaints", status: "FTC NEEDED" },
  "for cfpb only":  { department: "Complaints", status: "CFPB NEEDED" },
};

/**
 * Statuses that arrive as HISTORY rather than as work.
 *
 * Dee, 2026-09-23, asked for archived cards to be left in ClickUp. On
 * 2026-09-26 she changed her mind: "I want everything in clickup now."
 *
 * So they come across, and they come across ARCHIVED — lifecycle set, out of
 * every queue, out of My Work, out of the assignment engine. That is the
 * distinction that made the original answer reasonable and makes this one
 * safe: bringing a finished client's record over is not the same as putting
 * a finished client in front of an agent.
 *
 * The status is preserved as the card's own words in `source_status`, so
 * "why is this archived" is answerable without opening ClickUp.
 */
const ARCHIVED_STATUSES = new Set(["archived"]);

/** The ClickUp Current Round dropdown → the canonical round. */
function roundFrom(name: string | null): { round: string; freeze: boolean } {
  if (!name) return { round: "Pre-Round", freeze: false };
  if (/security\s*freeze/i.test(name)) return { round: "Pre-Round", freeze: true };
  const n = /Round\s+(\d+)/i.exec(name);
  if (!n) return { round: "Pre-Round", freeze: false };
  const v = Number(n[1]);
  /* The enum's fourth value is "Round 4+", not "Round 4" — it is the bucket
     where BES stopped counting individually. Writing "Round 4" raised
     22P02 and the whole card was refused, which is how Andre Patterson
     failed to import at all. The enum is the authority on its own spelling. */
  if (v === 4) return { round: "Round 4+", freeze: false };
  /* The canonical enum stops at 13; beyond that is a data question, not a
     silent clamp. */
  return { round: v >= 1 && v <= 13 ? `Round ${v}` : "Pre-Round", freeze: false };
}

/**
 * The description, as text worth keeping — or nothing.
 *
 * Dee, 2026-09-30: "EVERYTHING from the original ClickUp task description
 * must be preserved… Keep the original meaningful content, not parser
 * artifacts… never render undefined null [object Object]."
 *
 * ClickUp gives `text_content` (plain) and `description` (markdown). Plain
 * is preferred because it is what a human wrote, not what a renderer did to
 * it. Nothing is summarised, extracted or reworded here: the point of the
 * record is that it is the source. Only artifacts are removed, and if that
 * leaves nothing, nothing is stored.
 */
function preservableText(task: Record<string, unknown>): string | null {
  const pick = (v: unknown) => (typeof v === "string" ? v : "");
  let text = pick(task.text_content) || pick(task.description);
  text = text.replace(/\[object Object\]|\bundefined\b/g, "").trim();
  if (!text || /^(null|none)$/i.test(text)) return null;
  return text;
}

/**
 * Two different values for the same credential in one description.
 *
 * Dee: "Preserve ALL conflicting imported information rather than choosing a
 * password arbitrarily." The structured import stores ONE login per
 * provider, so a second value used to vanish. This only DETECTS the
 * conflict — the preserved description carries both values, and the client
 * is flagged for review. Nothing is chosen, and no value is returned.
 */
function credentialConflict(text: string): string | null {
  const values = new Set<string>();
  for (const m of text.matchAll(/\bpass(?:word|wd)?\s*[:=\-–]\s*(\S{4,})/gi)) values.add(m[1]);
  if (values.size < 2) return null;
  return `${values.size} different password values`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in first" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cuToken = Deno.env.get("CLICKUP_API_TOKEN");
  if (!url || !anon || !service) return json(500, { error: "Function is not configured" });
  if (!cuToken) return json(503, { error: "ClickUp is not connected", code: "not_connected" });

  const body = await req.json().catch(() => ({}));
  /**
   * `resume` and `max` exist for the FIRST import of a large list.
   *
   * A card costs about twenty seconds — two ClickUp calls, the write, and any
   * attachments — and an Edge Function is cut off at 150 seconds. Tiffany
   * Hunter's list is 72 cards, so one call was never going to finish it, and
   * a plain re-run starts from the top and spends its whole budget
   * re-matching what it already imported.
   *
   * With `resume`, a card whose task id is already in the crosswalk is
   * skipped before it is fetched; `max` stops the call while it still has
   * time to answer. Together they make the import restartable: call it until
   * `remaining` is zero.
   *
   * Both default off, so an ordinary re-run still refreshes every card, which
   * is what somebody pressing Import a second time means by it.
   */
  /**
   * `taskIds` re-imports named cards and nothing else.
   *
   * A card can fail on its own — Fernando Serrato's vault entries were lost
   * to a name collision while the client itself imported fine — and the only
   * ways to retry it were to walk 786 cards again or to delete its crosswalk
   * row, which would have created a second Fernando because his card carries
   * no email, phone or date of birth to match him by.
   *
   * With the crosswalk intact the matcher finds him by task id and UPDATES,
   * so the retry corrects the record instead of duplicating the person.
   */
  const { listId, viewId, groupId, dryRun, resume, max, offset, taskIds, roundScan } = body as {
    listId?: string; viewId?: string; groupId?: string; dryRun?: boolean;
    resume?: boolean; max?: number; offset?: number; taskIds?: string[];
    roundScan?: boolean;
  };
  /* `preserveDescription` resolves its client through the crosswalk, never
     from a caller-supplied group, so it needs neither a group nor a list. */
  const preserving = !!(body as { preserveDescription?: boolean }).preserveDescription;
  if (!groupId && !(body as { resolveOnly?: boolean }).resolveOnly && !preserving) {
    return json(400, { error: "groupId is required" });
  }
  if (!listId && !viewId && !roundScan && !preserving) return json(400, { error: "listId or viewId is required" });

  /* Normally the caller's own token, so the database applies the same rules it
     would to a browser and the import is attributed to whoever ran it.
     A service-role caller — the owner's own migration tooling — goes through
     the same function with the same code path; it gains nothing it did not
     already have, since that key bypasses row-level security outright. */
  const isService = auth.slice(7) === service;
  const asUser = isService
    ? createClient(url, service)
    : createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const cu = async <T>(path: string): Promise<T> => {
    const r = await fetch(`${CU}${path}`, { headers: { Authorization: cuToken } });
    if (!r.ok) throw new Error(`ClickUp ${path} → ${r.status}`);
    return (await r.json()) as T;
  };

  /**
   * `roundScan` reads which dispute round a card says it is on, and returns
   * NOTHING ELSE.
   *
   * 155 imported clients carry "In Dispute Mailed" with no round: ClickUp's
   * "Current Round" custom field is empty on their cards, and their comments
   * do not name one either. Many of the descriptions do, in prose.
   *
   * ── WHY THIS RUNS HERE AND NOT IN A SCRIPT ────────────────────────────
   *
   * A client card's description is the most dangerous text in the workspace:
   * it is where SSNs, dates of birth and credit-monitoring passwords are
   * written down, which is the whole reason the import scrubs them into the
   * vault instead of storing them. Pulling 155 descriptions out to a local
   * script — or into anyone's terminal — would spread exactly the data the
   * rest of this function exists to contain.
   *
   * So the text is read in the function's memory, matched, and dropped. What
   * crosses the wire is a task id and a number. There is no mode here that
   * returns description text, deliberately.
   *
   * ── WHAT COUNTS AS A ROUND ────────────────────────────────────────────
   *
   * Only the word ROUND immediately followed by a number. "Round letters
   * uploaded to LetterStream" names no round. A range — "rounds 1-4" — names
   * no single round either, and is reported as ranged rather than guessed at.
   * A dispute round is an FCRA record; the caller decides what to do with an
   * ambiguous answer, and this reports the ambiguity rather than resolving it.
   */
  /**
   * `preserveDescription`: store each card's original description as a
   * protected source note, and return NOTHING of it.
   *
   * The backfill for every card already imported (Dee, 2026-09-30: "not
   * only for future imports"). The text is read here, handed to the one
   * database writer, and dropped; what crosses the wire back is a task id
   * and whether it was stored. There is no mode that returns description
   * text, deliberately — see `roundScan` for why that matters on these cards.
   *
   * Idempotent: the writer updates the existing note for a task rather than
   * adding a second, so this can be rerun safely at any time.
   */
  if ((body as { preserveDescription?: boolean }).preserveDescription) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return json(400, { error: "preserveDescription needs taskIds" });
    }
    if (taskIds.length > 60) return json(400, { error: "at most 60 task ids per call" });
    const svc = createClient(url, service);
    const out: { id: string; stored: boolean; action?: string; reason?: string; conflict?: boolean; error?: string }[] = [];
    for (const id of taskIds) {
      try {
        const task = await cu<Record<string, unknown>>(`/task/${id}?include_subtasks=false`);
        const text = preservableText(task);
        if (!text) { out.push({ id, stored: false, reason: "empty" }); continue; }
        const conflict = credentialConflict(text);
        const { data, error } = await svc.rpc("clickup_preserve_description", {
          p_task_id: id, p_text: text, p_imported_at: null, p_conflict: conflict,
        });
        if (error) { out.push({ id, stored: false, error: error.message.slice(0, 120) }); continue; }
        const r = data as { stored: boolean; action?: string; reason?: string };
        out.push({ id, stored: r.stored, action: r.action, reason: r.reason, conflict: !!conflict });
      } catch (e) {
        out.push({ id, stored: false, error: String(e).slice(0, 120) });
      }
    }
    return json(200, { scanned: out.length, results: out });
  }

  if (roundScan) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return json(400, { error: "roundScan needs taskIds" });
    }
    if (taskIds.length > 60) return json(400, { error: "at most 60 task ids per scan" });

    /* "Round 2", "round #2", and the shorthand "R2" / "R 2" the processors
       write in notes (Dee, 2026-09-30: "Look for trustworthy round evidence
       such as R1 R2 Round 2 Round 3"). Bounded on both sides so "R2D2" and
       a tracking number do not read as rounds. */
    const EXPLICIT = /\b(?:round\s*#?\s*|r\s?)(\d{1,2})\b/gi;
    const RANGED = /\bround(s)?\s*#?\s*\d{1,2}\s*(?:-|–|to|through|thru|&|and)\s*#?\s*\d{1,2}/i;
    const out: { id: string; field: string | null; rounds: number[]; ranged: boolean; error?: string }[] = [];

    for (const id of taskIds) {
      try {
        const task = await cu<Record<string, unknown>>(`/task/${id}?include_subtasks=false`);

        /* The custom field first: where it is set, it is the operation's own
           answer and beats anything written in prose. */
        const rf = (task.custom_fields as { name: string; value?: unknown; type_config?: { options?: { orderindex: number; name: string }[] } }[] | undefined)
          ?.find((f) => f.name === "Current Round");
        const field = rf && rf.value !== undefined && rf.value !== null
          ? rf.type_config?.options?.find((o) => o.orderindex === Number(rf.value))?.name ?? null
          : null;

        const text = [task.description, task.text_content, task.name]
          .filter((t): t is string => typeof t === "string").join(" ");
        const ranged = RANGED.test(text);
        const rounds: number[] = [];
        for (const m of text.matchAll(EXPLICIT)) {
          const n = Number(m[1]);
          if (n >= 1 && n <= 12) rounds.push(n);
        }
        out.push({ id, field, rounds, ranged });
      } catch (e) {
        out.push({ id, field: null, rounds: [], ranged: false, error: String(e).slice(0, 120) });
      }
    }
    return json(200, { scanned: out.length, results: out });
  }

  /**
   * A ClickUp VIEW link, turned into the list behind it.
   *
   * What somebody copies out of the address bar is usually a view —
   * `/v/l/rk9kb-22578` — because that is the tab they were looking at. Only
   * `/v/li/…` carries a list id. `clickup-list-ref` has always parsed both and
   * said the import "resolves a view when it has to"; it never did, so a
   * partner linked by view could not be imported at all. Two of Dee's are.
   *
   * The parent's TYPE is checked rather than assumed: a view can hang off a
   * folder, a space or the whole workspace, and importing "every task in the
   * CreditOps space" into one partner because a number happened to fit is the
   * failure that has already happened once here, when Approve with Tiff had
   * the space id stored as its list.
   */
  const resolveView = async (id: string): Promise<{ listId: string; listName: string }> => {
    const v = await cu<{ view?: { id: string; name: string; parent?: { id: string; type: number } } }>(
      `/view/${id}`);
    const parent = v.view?.parent;
    if (!parent) throw new Error(`ClickUp view ${id} reports no parent`);
    /* Confirmed by fetching it AS a list rather than by trusting the type
       code — if it is a folder or a space, this fails and says so. */
    let list: { id: string; name: string };
    try {
      list = await cu<{ id: string; name: string }>(`/list/${parent.id}`);
    } catch {
      throw new Error(
        `That view belongs to a ${parent.type === 5 ? "folder" : parent.type === 4 ? "space" : "container"}, ` +
        `not a list (${parent.id}). Link the partner to one list — a folder holds several partners.`);
    }
    return { listId: list.id, listName: list.name };
  };

  /**
   * `resolveOnly` says which list a link points at, and how big it is.
   *
   * A partner link arrives as a VIEW — `/v/l/rk9kb-12318` — which names no
   * list and no partner. Before anything is imported, somebody has to know
   * WHICH partner's book this is, so the engagement, the team assignment and
   * the folder can be checked first; attaching 600 clients to the wrong
   * partner is not an easy thing to undo.
   *
   * It reads the list's name and its card count, nothing else: no task is
   * fetched, so no client detail is read and none can leak (see `roundScan`
   * for why that distinction matters on these cards). No `groupId`, because
   * the whole point is to learn which partner this is before choosing one.
   */
  if (roundScan === undefined && (body as { resolveOnly?: boolean }).resolveOnly) {
    if (!viewId && !listId) return json(400, { error: "resolveOnly needs viewId or listId" });
    try {
      const resolved = viewId
        ? await resolveView(viewId)
        : await cu<{ id: string; name: string }>(`/list/${listId}`)
            .then((l) => ({ listId: l.id, listName: l.name }));
      /* One page is enough for the count: ClickUp reports the total. */
      /* Both counts, because they are different questions. `include_closed`
         brings back cards in a CLOSED status; `archived=true` brings back
         cards in ClickUp's ARCHIVE, and ClickUp returns those INSTEAD of the
         live ones rather than alongside them. A list can hold archived cards
         that no ordinary query ever shows. */
      const live = await cu<{ tasks: unknown[]; last_page?: boolean }>(
        `/list/${resolved.listId}/task?include_closed=true&subtasks=false&page=0`);
      const archived = await cu<{ tasks: unknown[]; last_page?: boolean }>(
        `/list/${resolved.listId}/task?include_closed=true&archived=true&subtasks=false&page=0`);
      return json(200, {
        ...resolved,
        livePage0: live.tasks.length,
        liveHasMorePages: live.last_page === false,
        clickupArchivedPage0: archived.tasks.length,
        archivedHasMorePages: archived.last_page === false,
      });
    } catch (e) {
      return json(502, { error: (e as Error).message });
    }
  }

  const summary = {
    found: 0, matched: 0, created: 0, skipped: 0, notImported: 0,
    secrets: 0, comments: 0, attachments: 0, needsReview: [] as string[],
    duplicates: [] as string[], thinIdentity: [] as string[], crossPartner: 0,
    alreadyDone: 0, remaining: 0,
    perClient: [] as Record<string, unknown>[],
  };

  /**
   * What each card claimed to be, so duplicates can be judged after the run.
   *
   * Dee, 2026-09-23: "ANYONE WHO APPEAR TWICE, MERGE THEM. Ensure details are
   * the same, DOB and SSN and email and phone numbers are on file, so you'll
   * be able to identify if that's really a duplicate or simply has the same
   * name."
   *
   * `client_match_for_import` already does the merging, and already refuses
   * to merge on a name alone — it matches on the ClickUp task, then the
   * legacy id, then email, then phone digits, then name AND date of birth.
   * Two cards for one person with a shared email become one record without
   * anybody deciding anything.
   *
   * What it cannot do is tell somebody about the case it deliberately did
   * NOT merge. Two cards reading "Wilma Malu" with no email, no phone and no
   * date of birth between them are either one person or two, and guessing
   * either way is worse than saying so. Those are collected here and named
   * in the summary.
   */
  const seen = new Map<string, {
    name: string; records: Set<string>; email: boolean; phone: boolean;
    dob: boolean; ssn: boolean;
  }>();
  const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z]/g, "");
  const archivedNames = new Map<string, string>();
  /* Card ids that came out of ClickUp's ARCHIVE rather than the live list.
     Kept separately from `ARCHIVED_STATUSES` (a card whose STATUS is archived)
     because they are different facts that happen to land on the same column. */
  const clickupArchived = new Set<string>();

  try {
    /* Resolved first, so everything below deals in a list id only. */
    let resolvedList = listId ?? "";
    if (!resolvedList && viewId) {
      const v = await resolveView(viewId);
      resolvedList = v.listId;
      (summary as unknown as Record<string, unknown>).resolvedList = v.listId;
      (summary as unknown as Record<string, unknown>).resolvedListName = v.listName;
    }

    /* ── EVERY PAGE, NOT THE FIRST ──────────────────────────────────────
       ClickUp returns at most 100 tasks per request and says whether that
       was the last page. This asked once and took what it got, so a list of
       113 imported as 100 — and reported "100 found" with no hint that
       anything was missing. EDP Management Group lost seven clients that
       way, and it was only noticed because the next list ALSO reported
       exactly 100, which is not a number lists happen to be.

       Bounded at 50 pages: 5,000 cards is far beyond any partner here, and a
       loop that trusts an API to eventually say "last page" is a loop that
       can run forever. */
    type Brief = { id: string; name: string; status?: { status?: string } };

    const walk = async (archivedPass: boolean): Promise<Brief[]> => {
      const out: Brief[] = [];
      for (let page = 0; page < 50; page++) {
        const chunk = await cu<{ tasks: Brief[]; last_page?: boolean }>(
          `/list/${resolvedList}/task?include_closed=true&subtasks=true` +
          `${archivedPass ? "&archived=true" : ""}&page=${page}`);
        out.push(...(chunk.tasks ?? []));
        if (chunk.last_page || (chunk.tasks ?? []).length === 0) break;
        if (page === 49) {
          throw new Error(
            `That list has more than 5,000 cards, which is beyond what this import walks. ` +
            `Split it before importing, or nothing here can promise it is complete.`);
        }
      }
      return out;
    };

    /* ── TWO PASSES, BECAUSE ARCHIVED CARDS ARE NOT RETURNED BESIDE LIVE ONES ──
       `archived=true` is a FILTER, not an addition: ClickUp answers with the
       archived cards INSTEAD of the live ones. A single ordinary query can
       therefore never see them, and this import only ever ran the ordinary
       query — so a list's archive was invisible rather than empty.

       Dee, 2026-09-26: "I wanna ensure that we also INCLUDE ALL ARCHIVE FROM
       ALL the lists I already sent… I want everything in ClickUp now." That
       was honoured for cards carrying an ARCHIVED STATUS, which is a different
       thing and is why it looked done. It was not: 66 cards sat in ClickUp's
       own archive across three partners — 59 of them Vanquish Ventures' —
       and no query this function made could have returned one.

       The same shape as the pagination bug above: an API that answers a
       narrower question than the one being asked, and says nothing about it. */
    const liveTasks = await walk(false);
    const archivedTasks = await walk(true);

    /* `taskIdsOnly` answers "which cards exist in this list", and nothing
       else — ids and an archived flag, no card fetched, no detail read. It is
       how a completed import is CHECKED rather than assumed: compare it with
       the crosswalk and anything missing is named. Worth having as its own
       mode, because "the numbers look right" is how 66 archived cards went
       unnoticed in the first place. */
    if ((body as { taskIdsOnly?: boolean }).taskIdsOnly) {
      return json(200, {
        listId: resolvedList,
        ids: [...liveTasks, ...archivedTasks.filter((t) => !new Set(liveTasks.map((x) => x.id)).has(t.id))]
          .map((t) => t.id),
        live: liveTasks.length,
        archived: archivedTasks.length,
      });
    }
    const liveIds = new Set(liveTasks.map((t) => t.id));
    /* Belt and braces: if ClickUp ever does return a card in both passes,
       the live one wins rather than the row being imported twice. */
    const archivedOnly = archivedTasks.filter((t) => !liveIds.has(t.id));
    for (const t of archivedOnly) clickupArchived.add(t.id);
    const tasks: Brief[] = [...liveTasks, ...archivedOnly];
    (summary as unknown as Record<string, unknown>).fromClickUpArchive = archivedOnly.length;
    const list = {
      tasks: taskIds?.length
        ? tasks.filter((t) => taskIds.includes(t.id))
        : tasks,
    };
    summary.found = list.tasks.length;
    if (taskIds?.length && list.tasks.length !== taskIds.length) {
      /* Named a card that is not in this list: say so rather than silently
         importing the ones that happened to match. */
      const missing = taskIds.filter((id) => !tasks.some((t) => t.id === id));
      summary.needsReview.push(`not in this list: ${missing.join(", ")}`);
    }

    /* One query for the whole crosswalk, not one per card. */
    const done = new Set<string>();
    if (resume) {
      /* ── PAGED, BECAUSE POSTGREST STOPS AT 1,000 ─────────────────────
         This asked once and took what came back. The crosswalk passed a
         thousand rows during the Vanquish import — 1,151 across five
         partners — so `resume` was handed a TRUNCATED set of "already
         imported", decided 106 cards still needed doing, re-imported the
         same three on every pass and never finished. The same silent
         truncation that once made every attendance score read 15.

         Paged to exhaustion, and it RAISES if the pages stop making sense
         rather than resuming from a partial answer: a resume built on a
         short list is worse than no resume, because it looks like progress. */
      const admin = createClient(url, service);
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("import_links").select("source_id")
          .eq("source_system", "clickup").eq("source_kind", "task")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`Could not read the ClickUp crosswalk: ${error.message}`);
        const rows = (data ?? []) as { source_id: string }[];
        for (const row of rows) done.add(row.source_id);
        if (rows.length < PAGE) break;
        if (from > 200_000) {
          throw new Error("The ClickUp crosswalk is larger than this import can page through.");
        }
      }
    }
    let processed = 0;
    let index = -1;

    for (const brief of list.tasks) {
      index++;
      /* `offset` walks a list that must be REPROCESSED rather than resumed —
         after a parser fix, when every card needs reading again and `resume`
         would skip them all. Caller pages: offset 0, 4, 8 … */
      if (offset && index < offset) { summary.alreadyDone++; continue; }
      /* Before the card is fetched, so an archived card's SSN is never read. */
      const briefStatus = String(brief.status?.status ?? "").toLowerCase();
      /* Two independent ways a card is history: its STATUS says archived, or
         it sits in ClickUp's own ARCHIVE. Either one lands the client as
         archived here; neither is a reason to skip it (Dee: "I want
         everything in ClickUp now"). */
      const isArchived = ARCHIVED_STATUSES.has(briefStatus) || clickupArchived.has(brief.id);
      if (isArchived) {
        summary.notImported++;
        archivedNames.set(nameKey(brief.name), brief.name);
      }

      if (resume && done.has(brief.id)) { summary.alreadyDone++; continue; }
      if (max && processed >= max) { summary.remaining++; continue; }
      processed++;

      const task = await cu<Record<string, unknown>>(
        `/task/${brief.id}?include_subtasks=false`);
      const comments = (await cu<{ comments: CuComment[] }>(`/task/${brief.id}/comment`)).comments ?? [];

      /* text_content, never markdown_description: ClickUp mangles an email
         into a broken mailto link in the markdown and the plain text is
         clean. Giselle's card is the proof. */
      const description = String(task.text_content ?? "");
      const parsedDescription = parseClientCard(description, "description");

      const noteComments: { id: string; author: string; at: string; text: string }[] = [];
      const parsedComments: ParsedClient[] = [];
      for (const c of comments) {
        const text = String(c.comment_text ?? "");
        if (!text.trim()) continue;
        if (isAutomationNoise(c.user?.id, text)) { summary.skipped++; continue; }
        if (isAttachmentReceipt(text)) { summary.skipped++; continue; }
        parsedComments.push(parseClientCard(text, `comment ${c.id}`));
        noteComments.push({
          id: c.id,
          author: c.user?.username ?? "ClickUp",
          at: new Date(Number(c.date)).toISOString(),
          text,
        });
      }

      const merged = mergeCards(parsedDescription, parsedComments);

      /* Every secret found anywhere on the card, so the notes can be scrubbed
         of all of them before they reach a timeline. */
      const secretValues = merged.credentials.map((c) => c.secret);
      if (merged.ssn) secretValues.push(merged.ssn);

      const cuStatus = String((task.status as { status?: string })?.status ?? "").toLowerCase();
      const mappedStatus = STATUS_MAP[cuStatus];
      if (!mappedStatus && !isArchived) {
        /* Named, not guessed. A card landing on "New Client" because nobody
           taught the map its status looks imported and is in the wrong queue,
           so it is called out by name for somebody to answer. */
        merged.needsReview.push(`ClickUp status "${cuStatus}" has no canonical mapping yet`);
      }
      const override = DEPARTMENT_OVERRIDE[cuStatus] ?? null;

      const roundField = (task.custom_fields as { name: string; value?: unknown; type_config?: { options?: { orderindex: number; name: string }[] } }[] | undefined)
        ?.find((f) => f.name === "Current Round");
      const roundName = roundField && roundField.value !== undefined && roundField.value !== null
        ? roundField.type_config?.options?.find((o) => o.orderindex === Number(roundField.value))?.name ?? null
        : null;
      const { round, freeze } = roundFrom(roundName);
      if (freeze) merged.notes.push("ClickUp Current Round: SECURITY FREEZE ONLY");

      /* The description's address is current; a different one in a comment is
         history, flagged rather than discarded (Dee's ruling on Bryan). */
      const addressHistory: Record<string, unknown>[] = [];
      for (const c of parsedComments) {
        if (!c.address?.line1) continue;
        if (c.address.line1 === merged.address?.line1) continue;
        addressHistory.push({
          line1: c.address.line1, city: c.address.city, state: c.address.state,
          postal_code: c.address.postalCode, source: "clickup_comment",
          source_ref: `clickup:${brief.id}:address`, recorded_at: null,
          needs_review: true, note: "A different address appeared in a ClickUp comment",
        });
      }

      /* ── THE CARD TITLE IS THE NAME, UNLESS THE CARD TEXT AGREES ──────
         The parser used to win outright, and it kept lifting things that are
         not people. Two cards with a pasted screenshot produced "image.png".
         Four more produced "High alert, special cases, Use the most
         aggressive approach for disputing." — a dispute instruction, imported
         as four clients' names.
         
         Guessing which line of free text is a name is the wrong problem to
         solve. The ClickUp card title IS the client's name; the parsed name
         is only worth preferring when it is the SAME person written more
         fully ("Jane S." → "Jane Marie Smith"), and that case always shares a
         word with the title. So the title wins unless the parsed name looks
         like a person AND overlaps it. */
      const wordsOf = (n: string) =>
        n.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 1);
      const looksLikeAPerson = (n: string | null | undefined): n is string => {
        if (!n) return false;
        const t = n.trim();
        if (t.length > 60 || !/[a-z]/i.test(t)) return false;
        if (/[.,;:!?]/.test(t.replace(/\b(jr|sr|ii|iii|dr|mr|mrs|ms)\.?/gi, ""))) return false;
        if (/\.(png|jpe?g|gif|webp|pdf|heic|docx?|xlsx?|csv)$/i.test(t)) return false;
        return t.split(/\s+/).length <= 5;
      };
      const titleWords = new Set(wordsOf(brief.name));
      const parsedFits = looksLikeAPerson(merged.fullName)
        && wordsOf(merged.fullName).some((w) => titleWords.has(w));
      const fullName = parsedFits ? merged.fullName! : brief.name;
      if (!parsedFits && merged.fullName && merged.fullName.trim() !== brief.name.trim()) {
        merged.needsReview.push(
          `the card text gave "${merged.fullName.slice(0, 60)}" as the name; used the ClickUp title instead`);
      }
      const titleFirst = fullName.split(/\s+/)[0];
      const titleLast = fullName.split(/\s+/).slice(1).join(" ") || null;

      /* `clients.state` is a two-letter code. A card writing "Florida" — or a
         whole address line the parser mistook for a state — failed the check
         constraint and took the ENTIRE client with it: Tyree Shavers and
         Scott Watson did not import at all because of this. The value is
         normalised, and anything unrecognisable is dropped rather than
         allowed to cost a client. The card text is kept whole in the notes
         either way, so nothing is actually lost. */
      const STATES: Record<string, string> = {
        alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
        colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
        florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
        indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
        maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
        mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
        "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
        "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
        oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
        "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
        virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
        wyoming: "WY", "puerto rico": "PR",
      };
      const stateCode = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const t = raw.trim();
        if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
        const mapped = STATES[t.toLowerCase()];
        if (mapped) return mapped;
        merged.needsReview.push(`could not read "${t.slice(0, 40)}" as a state; left blank`);
        return null;
      };

      const payload = {
        group_id: groupId,
        task_id: brief.id,
        full_name: fullName,
        first_name: parsedFits && merged.firstName ? merged.firstName : titleFirst,
        last_name: parsedFits && merged.lastName ? merged.lastName : titleLast,
        email: merged.email, phone: merged.phone, dob: merged.dateOfBirth,
        address_line1: merged.address?.line1 ?? null,
        city: merged.address?.city ?? null,
        state: stateCode(merged.address?.state),
        postal_code: merged.address?.postalCode ?? null,
        /* An archived card is an inactive client, whatever its last working
           status was. Routing sends "Inactive / Canceled" to no department,
           and the lifecycle below keeps it out of the queues regardless. */
        status: isArchived ? "Inactive / Canceled" : (mappedStatus ?? "New Client"),
        archived: isArchived,
        round,
        /* The ClickUp due date is provenance only — canonical SLA replaces it
           once FullSuite has the anchors (Dee). */
        due_at: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
        source_status: cuStatus, legacy_client_id: merged.legacyClientId,
        started_on: merged.startedOn,
        breach_equifax: merged.breachEquifax, breach_npd: merged.breachNpd,
        security_freeze_only: freeze,
        department: override?.department ?? null,
        department_status: override?.status ?? null,
        ssn: merged.ssn,
        credentials: merged.credentials.map((c) => ({
          kind: c.provider === "CFPB" ? "cfpb" : "monitoring",
          provider: c.provider,
          label: c.provider === "CFPB" ? "CFPB complaint portal" : "Credit monitoring",
          username: c.username, secret: c.secret, url: null,
        })),
        /* The CARD ITSELF, kept whole and scrubbed — the same discipline the
           partner card import used in 0263/0264. Parsing lifts the fields we
           know how to store; it cannot know that "SWEEP", "OPEN ACCOUNTS /
           CAPITAL ONE AUTO" or "RD/WE/AVENUE" matter to whoever works the
           file. Throwing away the text because the parser found no field in
           it is exactly the loss Dee objected to. */
        notes: [
          ...(description.trim()
            ? [{
                source_id: `task:${brief.id}:description`,
                author: (task.creator as { username?: string })?.username ?? "ClickUp",
                at: task.date_created
                  ? new Date(Number(task.date_created)).toISOString()
                  : new Date().toISOString(),
                text: scrubSecrets(description, secretValues),
              }]
            : []),
          ...noteComments.map((n) => ({
            source_id: n.id, author: n.author, at: n.at,
            text: scrubSecrets(n.text, secretValues),
          })),
        ],
        address_history: addressHistory,
      };

      if (dryRun) {
        summary.perClient.push({ name: payload.full_name, task: brief.id, wouldCreate: true });
        continue;
      }

      const { data, error } = await asUser.rpc("clickup_import_client", { p: payload });
      if (error) {
        summary.needsReview.push(`${payload.full_name}: ${error.message}`);
        continue;
      }
      const r = data as {
        created: boolean; secrets: number; notes: number; cross_partner_notes?: number;
      };
      /* A COUNT, deliberately. Which person and which partner is a fact about
         the other partner's book, and this summary is not the place to spend
         it (Dee, 2026-09-24, D-023). It is readable in the link table by
         somebody authorized for both partners, and nowhere else. */
      summary.crossPartner += r.cross_partner_notes ?? 0;
      if (r.created) summary.created++; else summary.matched++;

      /* The original description, preserved as a protected source note —
         through the same single writer the backfill uses, so a card
         imported today and a card imported in August end up with the same
         record. After the client write, because the writer resolves the
         client through the crosswalk that write just recorded. A failure
         here is noted and does not undo the import. */
      {
        const text = preservableText(task as unknown as Record<string, unknown>);
        if (text) {
          const { error: pErr } = await admin.rpc("clickup_preserve_description", {
            p_task_id: brief.id, p_text: text, p_imported_at: null,
            p_conflict: credentialConflict(text),
          });
          if (pErr) summary.needsReview.push(`${payload.full_name}: description not preserved — ${pErr.message}`);
        }
      }

      /* Which record this card ended up on, and what it had to identify
         itself with. Two cards landing on ONE record is the merge working;
         two cards landing on TWO records under one name is the case a human
         has to settle. */
      const key = nameKey(payload.full_name);
      const entry = seen.get(key) ?? {
        name: payload.full_name, records: new Set<string>(),
        email: false, phone: false, dob: false, ssn: false,
      };
      entry.records.add((data as { fulfillment_client_id: string }).fulfillment_client_id);
      entry.email ||= Boolean(payload.email);
      entry.phone ||= Boolean(payload.phone);
      entry.dob ||= Boolean(payload.dob);
      /* Whether an SSN is ON FILE, never the number. */
      entry.ssn ||= Boolean(payload.ssn);
      seen.set(key, entry);
      summary.secrets += r.secrets ?? 0;
      summary.comments += r.notes ?? 0;
      merged.needsReview.forEach((x) => summary.needsReview.push(`${payload.full_name}: ${x}`));

      /* Attachments last: the client must exist before a file can hang off it. */
      const atts = (task.attachments as CuAttachment[] | undefined) ?? [];
      const admin = createClient(url, service);
      const fcId = (data as { fulfillment_client_id: string }).fulfillment_client_id;
      for (const a of atts) {
        const already = await admin.from("import_links").select("id")
          .eq("source_system", "clickup").eq("source_kind", "attachment").eq("source_id", a.id).maybeSingle();
        if (already.data) continue;
        if (!a.url) continue;
        const file = await fetch(a.url, { headers: { Authorization: cuToken } });
        if (!file.ok) { summary.needsReview.push(`${payload.full_name}: could not fetch ${a.title}`); continue; }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const path = `clients/${fcId}/clickup/${a.id}-${a.title.replace(/[^\w.-]/g, "_")}`;
        const up = await admin.storage.from("bes-files").upload(path, bytes, {
          contentType: a.mimetype || "application/octet-stream", upsert: true,
        });
        if (up.error) { summary.needsReview.push(`${payload.full_name}: ${a.title} — ${up.error.message}`); continue; }
        await admin.from("files").insert({
          agency_id: (data as { agency_id?: string }).agency_id ?? null,
          /* `fulfillment_client`, which is what every CreditOps screen reads.
             This said "client" and the repoint on 2026-09-24 fixed the rows
             already written and the ACTIVITY writer beside it — and missed
             this one, in the same migration whose whole point was that fixing
             a consumer and leaving the producer is how a bug comes back with
             more data behind it. Kevin Hernandez's 80 attachments arrived
             invisible. */
          entity_type: "fulfillment_client", entity_id: fcId, bucket: "bes-files", path,
          name: a.title, mime_type: a.mimetype, size_bytes: a.size,
          created_at: new Date(Number(a.date)).toISOString(),
        });
        await admin.rpc("import_link_record", {
          p_source_system: "clickup", p_source_kind: "attachment", p_source_id: a.id,
          p_entity_type: "file", p_entity_id: fcId, p_batch: null,
        });
        summary.attachments++;
      }
    }
    /* ── WHO NEEDS A HUMAN TO LOOK ─────────────────────────────────────── */
    for (const e of seen.values()) {
      const held = [
        e.email ? "email" : null, e.phone ? "phone" : null,
        e.dob ? "date of birth" : null, e.ssn ? "SSN" : null,
      ].filter(Boolean);

      if (e.records.size > 1) {
        /* The matcher saw both cards and declined to merge them, because the
           only thing they share is a name. Said plainly, with what they do
           and do not have, so the answer is one look rather than an
           investigation. */
        summary.duplicates.push(
          `${e.name}: ${e.records.size} separate records — the cards share a name but nothing that proves ` +
          `one person${held.length ? ` (on file between them: ${held.join(", ")})` : " (no email, phone, date of birth or SSN on either)"}`);
      }

      /* A file with none of the four cannot be matched against anything
         later — not another list, not a second card, not a returning client.
         Worth knowing now rather than discovering it at the third import. */
      if (held.length === 0) {
        summary.thinIdentity.push(e.name);
      }
    }

    for (const [key, name] of archivedNames) {
      const live = seen.get(key);
      if (!live) continue;
      summary.duplicates.push(
        `${name}: an ARCHIVED card of the same name was left in ClickUp as agreed. ` +
        `If it holds details the live card does not, they did not come across.`);
    }
  } catch (e) {
    return json(502, { error: (e as Error).message, summary });
  }

  return json(200, summary);
});
