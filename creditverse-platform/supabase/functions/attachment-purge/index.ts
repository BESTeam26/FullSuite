/**
 * The attachment purge worker.
 *
 * SQL cannot delete a storage object, so the database records the intent in
 * `attachment_purge_queue` and this function carries it out with the service
 * role and the Storage API. It is the only thing in the platform that removes
 * a stored file.
 *
 * ── WHAT IT WILL AND WILL NOT DELETE ──────────────────────────────────────
 *
 * Only objects the database has queued, and only after asking the database
 * again — at the moment of deletion — whether any LIVE message still shows
 * that bucket+path. A file re-posted between the queue and the sweep keeps
 * its object and the queue row is dropped. Two `files` rows may name one
 * object; one going away is not permission to delete it.
 *
 * ── IDEMPOTENT, BOUNDED, AND IT GIVES UP ──────────────────────────────────
 *
 * Bounded batch per run. A row already purged is skipped. A transient failure
 * (network, 5xx) increments `retry_count` and is tried again next run. A path
 * Storage will never accept is abandoned after MAX_RETRIES with the reason
 * recorded, so the queue cannot spin on it forever. Supabase's remove() is
 * itself idempotent: deleting an object that is already gone succeeds, which
 * is the behaviour a retry needs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BATCH = 50;
const MAX_RETRIES = 5;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface QueueRow {
  id: string;
  bucket: string;
  path: string;
  retry_count: number;
}

Deno.serve(async (req) => {
  /* Called by pg_cron through pg_net with a shared secret, or by an operator
     with the same secret. Never by a browser: it holds the service role. */
  const expected = Deno.env.get("PURGE_DISPATCH_SECRET")?.trim();
  if (!expected || req.headers.get("x-dispatch-secret")?.trim() !== expected) {
    return json(401, { error: "Not authorized." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "The function is not configured." });
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  /* `dry_run` reports without touching storage — the same decision the real
     run makes, so the report cannot describe a different job. */
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

  const { data: rows, error } = await sb
    .from("attachment_purge_queue")
    .select("id, bucket, path, retry_count")
    .is("deleted_at", null)
    .is("abandoned_at", null)
    .lt("retry_count", MAX_RETRIES)
    .order("requested_at", { ascending: true })
    .limit(BATCH);
  if (error) return json(500, { error: error.message });

  const out = { considered: (rows ?? []).length, deleted: 0, kept: 0, failed: 0, abandoned: 0, dryRun };
  const detail: Record<string, unknown>[] = [];

  for (const row of (rows ?? []) as QueueRow[]) {
    /* Asked again, now: the world may have changed since it was queued. */
    const { data: live, error: liveErr } = await sb.rpc("attachment_has_live_reference", {
      p_bucket: row.bucket,
      p_path: row.path,
    });
    if (liveErr) {
      out.failed += 1;
      detail.push({ path: row.path, action: "check failed", error: liveErr.message });
      continue;
    }
    if (live === true) {
      out.kept += 1;
      detail.push({ path: row.path, action: "kept — a live message still shows it" });
      if (!dryRun) await sb.from("attachment_purge_queue").delete().eq("id", row.id);
      continue;
    }
    if (dryRun) {
      out.deleted += 1;
      detail.push({ path: `${row.bucket}/${row.path}`, action: "would delete" });
      continue;
    }

    const attemptedAt = new Date().toISOString();
    const { error: rmErr } = await sb.storage.from(row.bucket).remove([row.path]);
    if (rmErr) {
      const retries = row.retry_count + 1;
      const giveUp = retries >= MAX_RETRIES;
      await sb.from("attachment_purge_queue").update({
        attempted_at: attemptedAt,
        retry_count: retries,
        failure_reason: rmErr.message,
        abandoned_at: giveUp ? new Date().toISOString() : null,
      }).eq("id", row.id);
      if (giveUp) { out.abandoned += 1; detail.push({ path: row.path, action: "abandoned", error: rmErr.message }); }
      else { out.failed += 1; detail.push({ path: row.path, action: "will retry", error: rmErr.message }); }
      continue;
    }

    await sb.from("attachment_purge_queue").update({
      attempted_at: attemptedAt,
      deleted_at: new Date().toISOString(),
      failure_reason: null,
    }).eq("id", row.id);
    out.deleted += 1;
    detail.push({ path: `${row.bucket}/${row.path}`, action: "deleted" });
  }

  return json(200, { ...out, detail });
});
