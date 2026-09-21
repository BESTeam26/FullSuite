/**
 * The attachment purge, as a rule rather than as a one-off sweep.
 *
 * What must hold for ever after Dee's 2026-09-21 instruction:
 *   · deleting a message queues what it carried, at once
 *   · an object a LIVE message still shows is never queued, and never deleted
 *   · the queue is idempotent — the same object cannot be queued twice
 *   · the dry-run report says what the worker will do, from the same rule
 *   · a purged row records the outcome and is not offered again
 *
 * Storage itself is the worker's business and cannot be exercised from SQL;
 * everything up to the delete call is checked here, in rolled-back
 * transactions against the live database.
 *
 * Run: node supabase/scripts/attachment-purge-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
let pass = 0; const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const AUTHOR = one(`select m.user_id from agency_memberships m join profiles p on p.id = m.user_id
                     where m.is_owner and p.email like '%blessedempireservices.com' order by p.email limit 1`).user_id;
/* A channel the author can actually READ: `delete_own_message` is security
   INVOKER on purpose, so the probe must stand where a real person stands. */
const CHANNEL = one(`select c.id from channels c
   join channel_members m on m.channel_id = c.id and m.user_id = '${AUTHOR}'
  where c.kind <> 'direct' and c.archived_at is null limit 1`).id;

const session = (u) => `set local role authenticated; do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true); end $c$;`;
const PATH = "probe/attachment-purge/one.png";

/** A message with one attachment, then whatever the case does to it. */
const scenario = (body) => q.query(`
  begin;
  set local role postgres;
  insert into messages (id, channel_id, author_id, body, body_text, message_type)
  overriding system value
  values (9000001, '${CHANNEL}', '${AUTHOR}', '{}'::jsonb, 'probe message', 'message');
  insert into files (agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
  values ('${AGENCY}', 'channel_message', '9000001', 'bes-files', '${PATH}', 'one.png', 'image/png', 10, '${AUTHOR}');
  ${body}
  rollback;`);

console.log("\nA deleted message queues what it carried");
{
  const r = scenario(`
    ${session(AUTHOR)}
    select public.delete_own_message(9000001);
    set local role postgres;
    select (select count(*)::int from attachment_purge_queue where path = '${PATH}') queued,
           (select count(*)::int from files where path = '${PATH}') file_rows_left,
           (select reason from attachment_purge_queue where path = '${PATH}') reason;`);
  const row = r.at(-1) ?? {};
  check("1 · the object is queued the moment the message is deleted", row.queued, 1);
  check("2 · …with the reason recorded", row.reason, "message_deleted");
  check("3 · …and the dangling file row is gone", row.file_rows_left, 0);
}

console.log("\nAn object a live message still shows is protected");
{
  /* `files.path` is UNIQUE, so two rows cannot name one object today — the
     shared-object case can only arise if a future writer drops that
     constraint. The live-reference check is the guard either way, and what
     it must get right now is the ordinary case: one person deleting their
     message does not take away somebody else's picture. */
  const OTHER = "probe/attachment-purge/other.png";
  const r = scenario(`
    insert into messages (id, channel_id, author_id, body, body_text, message_type)
    overriding system value
    values (9000002, '${CHANNEL}', '${AUTHOR}', '{}'::jsonb, 'still here', 'message');
    insert into files (agency_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
    values ('${AGENCY}', 'channel_message', '9000002', 'bes-files', '${OTHER}', 'other.png', 'image/png', 10, '${AUTHOR}');
    ${session(AUTHOR)}
    select public.delete_own_message(9000001);
    set local role postgres;
    select (select count(*)::int from attachment_purge_queue where path = '${OTHER}') other_queued,
           (select count(*)::int from files where path = '${OTHER}') other_file_kept,
           (select public.attachment_has_live_reference('bes-files', '${OTHER}')) other_live,
           (select public.attachment_has_live_reference('bes-files', '${PATH}')) mine_live;`);
  const row = r.at(-1) ?? {};
  check("4 · the live message's object is not queued", row.other_queued, 0);
  check("5 · …and its file row is untouched", row.other_file_kept, 1);
  check("6 · the live-reference check holds it", row.other_live, true);
  check("7 · …and releases the deleted one", row.mine_live, false);
}

console.log("\nQueueing is idempotent, and never premature");
{
  /* The runner returns the LAST result set, so each assertion is its own
     scenario rather than a select buried mid-transaction. */
  const live = scenario(`
    set local role postgres;
    select public.queue_message_attachments_for_purge(9000001);
    select count(*)::int rows from attachment_purge_queue where path = '${PATH}';`);
  check("8 · a live message's own object is never queued, even by a direct call", live.at(-1)?.rows, 0);

  const twice = scenario(`
    set local role postgres;
    update messages set deleted_at = now(), deleted_by = '${AUTHOR}' where id = 9000001;
    select public.queue_message_attachments_for_purge(9000001);
    select public.queue_message_attachments_for_purge(9000001);
    select count(*)::int rows from attachment_purge_queue where path = '${PATH}';`);
  check("8b · queueing a deleted one twice leaves a single row", twice.at(-1)?.rows, 1);
}

console.log("\nThe report describes the same decision the worker makes");
{
  const r = scenario(`
    ${session(AUTHOR)}
    select public.delete_own_message(9000001);
    select action, live_references from public.attachment_purge_report() where object_path like '%${PATH}';`);
  const row = r.at(-1) ?? {};
  check("9 · a queued orphan reads 'delete' with no live references", [row.action, row.live_references], ["delete", 0]);
}

console.log("\nA purged row is finished with");
{
  const r = scenario(`
    set local role postgres;
    update messages set deleted_at = now(), deleted_by = '${AUTHOR}' where id = 9000001;
    select public.queue_message_attachments_for_purge(9000001);
    update attachment_purge_queue set deleted_at = now() where path = '${PATH}';
    select (select count(*)::int from attachment_purge_queue
             where path = '${PATH}' and deleted_at is null and abandoned_at is null) still_pending,
           (select action from public.attachment_purge_report() where object_path like '%${PATH}') action;`);
  const row = r.at(-1) ?? {};
  check("10 · it is not offered to the worker again", row.still_pending, 0);
  check("11 · …and the report says it is already purged", row.action, "already purged");
}

console.log("\nNobody reads the queue from a browser");
{
  const denied = (() => {
    try {
      q.query(`begin; ${session(AUTHOR)} select count(*) from attachment_purge_queue; rollback;`);
      return false;
    } catch { try { q.query("rollback;"); } catch { /* gone */ } return true; }
  })();
  check("12 · the queue table itself is not readable by an authenticated user", denied, true);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
