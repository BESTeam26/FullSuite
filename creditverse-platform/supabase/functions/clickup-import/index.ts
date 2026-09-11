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

/** ClickUp's status strings → the canonical lifecycle plus a queue. */
const STATUS_MAP: Record<string, { status: string; department?: string; queue?: string }> = {
  "process r1":          { status: "Ready for Round 1", department: "Onboarding", queue: "Ready for Round 1" },
  "ready for processing":{ status: "Ready for Processing", department: "Onboarding", queue: "Ready for Processing" },
  "processing prio":     { status: "Prio Processing", department: "Dispute", queue: "Priority" },
  "indispute - mailed":  { status: "In Dispute", department: "Dispute", queue: "Mailed" },
  "editing & mailing":   { status: "LETTERS PENDING", department: "Dispute", queue: "Editing & mailing" },
  /* "needed" is not "filed" — the action is still outstanding (Dee). */
  "ftc needed":          { status: "In Dispute", department: "Complaints", queue: "FTC Needed" },
  "for cfpb only":       { status: "In Dispute", department: "Complaints", queue: "CFPB Needed" },
  "for complaints":      { status: "For Complaints", department: "Complaints", queue: "For Complaints" },
  "onboarding follow up":{ status: "ONBOARDING FOLLOWUP", department: "Onboarding", queue: "Follow up" },
  "incomplete onboarding":{ status: "Incomplete Onboarding", department: "Onboarding", queue: "Incomplete" },
  "for client confirmation": { status: "For Partner Confirmation", department: "Support", queue: "Awaiting confirmation" },
  "suspended":           { status: "On Hold (Non Workable)" },
  "completed/ graduated":{ status: "Graduated" },
  "archived":            { status: "Archived" },
};

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

  /* The caller's own token: the database applies the same rules it would to a
     browser, and the import is attributed to the person who ran it. */
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const cu = async <T>(path: string): Promise<T> => {
    const r = await fetch(`${CU}${path}`, { headers: { Authorization: cuToken } });
    if (!r.ok) throw new Error(`ClickUp ${path} → ${r.status}`);
    return (await r.json()) as T;
  };

  const summary = {
    found: 0, matched: 0, created: 0, skipped: 0,
    secrets: 0, comments: 0, attachments: 0, needsReview: [] as string[],
    perClient: [] as Record<string, unknown>[],
  };

  try {
    const list = await cu<{ tasks: { id: string; name: string }[] }>(
      `/list/${listId}/task?include_closed=true&subtasks=true`);
    summary.found = list.tasks.length;

    for (const brief of list.tasks) {
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
      const mapped = STATUS_MAP[cuStatus] ?? { status: "New Client" };
      if (!STATUS_MAP[cuStatus]) {
        merged.needsReview.push(`ClickUp status "${cuStatus}" has no canonical mapping yet`);
      }

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
        status: mapped.status, round,
        /* The ClickUp due date is provenance only — canonical SLA replaces it
           once FullSuite has the anchors (Dee). */
        due_at: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
        source_status: cuStatus, legacy_client_id: merged.legacyClientId,
        started_on: merged.startedOn,
        breach_equifax: merged.breachEquifax, breach_npd: merged.breachNpd,
        security_freeze_only: freeze,
        department: mapped.department ?? null, department_status: mapped.queue ?? null,
        ssn: merged.ssn,
        credentials: merged.credentials.map((c) => ({
          kind: c.provider === "CFPB" ? "cfpb" : "monitoring",
          provider: c.provider,
          label: c.provider === "CFPB" ? "CFPB complaint portal" : "Credit monitoring",
          username: c.username, secret: c.secret, url: null,
        })),
        notes: noteComments.map((n) => ({
          source_id: n.id, author: n.author, at: n.at,
          text: scrubSecrets(n.text, secretValues),
        })),
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
        const path = `clients/${fcId}/clickup/${a.id}-${a.title.replace(/[^\w.\-]/g, "_")}`;
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
  } catch (e) {
    return json(502, { error: (e as Error).message, summary });
  }

  return json(200, summary);
});
