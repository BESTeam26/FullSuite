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
 * Statuses that are not imported at all.
 *
 * Dee, 2026-09-23, on the 13 archived cards in Tiffany Hunter's list: leave
 * them in ClickUp. They are finished history, nothing is lost by leaving them
 * where they are, and bringing them across would put a dozen files in front
 * of agents that nobody is working. They are skipped before the card is
 * fetched, so no SSN on an archived card is even read.
 */
const NOT_IMPORTED = new Set(["archived"]);

/** The ClickUp Current Round dropdown → the canonical round. */
function roundFrom(name: string | null): { round: string; freeze: boolean } {
  if (!name) return { round: "Pre-Round", freeze: false };
  if (/security\s*freeze/i.test(name)) return { round: "Pre-Round", freeze: true };
  const n = /Round\s+(\d+)/i.exec(name);
  if (!n) return { round: "Pre-Round", freeze: false };
  const v = Number(n[1]);
  /* The canonical enum stops at 13; beyond that is a data question, not a
     silent clamp. */
  return { round: v >= 1 && v <= 13 ? `Round ${v}` : "Pre-Round", freeze: false };
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
  const { listId, groupId, dryRun } = body as { listId?: string; groupId?: string; dryRun?: boolean };
  if (!listId || !groupId) return json(400, { error: "listId and groupId are required" });

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

  const summary = {
    found: 0, matched: 0, created: 0, skipped: 0, notImported: 0,
    secrets: 0, comments: 0, attachments: 0, needsReview: [] as string[],
    duplicates: [] as string[], thinIdentity: [] as string[],
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

  try {
    const list = await cu<{ tasks: { id: string; name: string; status?: { status?: string } }[] }>(
      `/list/${listId}/task?include_closed=true&subtasks=true`);
    summary.found = list.tasks.length;

    for (const brief of list.tasks) {
      /* Before the card is fetched, so an archived card's SSN is never read. */
      const briefStatus = String(brief.status?.status ?? "").toLowerCase();
      if (NOT_IMPORTED.has(briefStatus)) {
        summary.notImported++;
        archivedNames.set(nameKey(brief.name), brief.name);
        continue;
      }

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
      if (!mappedStatus) {
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

      const payload = {
        group_id: groupId,
        task_id: brief.id,
        full_name: merged.fullName ?? brief.name,
        first_name: merged.firstName ?? brief.name.split(/\s+/)[0],
        last_name: merged.lastName ?? (brief.name.split(/\s+/).slice(1).join(" ") || null),
        email: merged.email, phone: merged.phone, dob: merged.dateOfBirth,
        address_line1: merged.address?.line1 ?? null,
        city: merged.address?.city ?? null,
        state: merged.address?.state ?? null,
        postal_code: merged.address?.postalCode ?? null,
        status: mappedStatus ?? "New Client", round,
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
      const r = data as { created: boolean; secrets: number; notes: number };
      if (r.created) summary.created++; else summary.matched++;

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
          entity_type: "client", entity_id: fcId, bucket: "bes-files", path,
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
