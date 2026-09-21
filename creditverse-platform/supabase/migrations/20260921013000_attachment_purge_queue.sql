-- Deleting a message must eventually delete what it carried.
--
-- Dee, 2026-09-21, on a client's credit report posted by mistake: "I would not
-- leave sensitive client artifacts sitting indefinitely in storage after the
-- user deletes the message." Hiding it from every reader (20260921012000) was
-- the first half; this is the second.
--
--   message delete → tombstone → attachments hidden → rows queued for purge
--   → a worker with the service role deletes the objects through the Storage
--   API → the queue records what happened → transient failures retry, invalid
--   paths stop.
--
-- ── WHY A QUEUE AND NOT A TRIGGER THAT DELETES ────────────────────────────
--
-- SQL cannot delete a storage object — Supabase refuses it ("Use the Storage
-- API instead"), as this project learned during the Communication reset. So
-- the database records the INTENT and a worker carries it out. That split is
-- also what makes it idempotent and retryable: the row is the state machine,
-- and running the worker twice changes nothing the second time.
--
-- ── AND WHY A PATH IS CHECKED, NOT A ROW ──────────────────────────────────
--
-- Two `files` rows may name one object. Deleting the object because one row
-- went away would break the other. Every step here asks "does any LIVE
-- reference still point at this bucket+path", and refuses while one does.

create table if not exists public.attachment_purge_queue (
  id              uuid primary key default gen_random_uuid(),
  bucket          text not null,
  path            text not null,
  /** Where it came from, kept after the file row is gone — this is the audit. */
  source_file_id  uuid,
  source_message_id bigint,
  /** Why it is here: a deleted message, or an orphan with no owner left. */
  reason          text not null check (reason in ('message_deleted', 'orphaned')),
  requested_at    timestamptz not null default now(),
  attempted_at    timestamptz,
  deleted_at      timestamptz,
  failure_reason  text,
  retry_count     int not null default 0,
  /** Stopped on purpose: a path the Storage API will never accept. */
  abandoned_at    timestamptz,
  /* One live queue row per object. A second delete of the same path is the
     same request, which is what makes enqueueing idempotent. */
  unique (bucket, path)
);

comment on table public.attachment_purge_queue is
  'Objects whose message was deleted, waiting for the Storage API worker. SQL cannot delete storage; this records the intent, the attempts and the outcome.';

create index if not exists attachment_purge_pending_idx
  on public.attachment_purge_queue (requested_at)
  where deleted_at is null and abandoned_at is null;

alter table public.attachment_purge_queue enable row level security;
revoke all on public.attachment_purge_queue from public, anon, authenticated;
/* Nobody reads this from a browser: it is a worker's queue, and it names the
   paths of files somebody asked to have removed. The service role reaches it
   by bypassing RLS; admins read it through the report function below. */

/**
 * Is this object still owned by something live?
 *
 * A file row whose message is gone is not a reference. Anything else is.
 */
create or replace function public.attachment_has_live_reference(p_bucket text, p_path text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.files f
      left join public.messages m
        on f.entity_type = 'channel_message' and m.id::text = f.entity_id
     where f.bucket = p_bucket
       and f.path = p_path
       and (f.entity_type <> 'channel_message' or (m.id is not null and m.deleted_at is null))
  )
$function$;
revoke execute on function public.attachment_has_live_reference(text, text) from public, anon;

/**
 * Queue every object a deleted message carried, and drop the file rows that
 * point at it — a row naming an object nobody may see is a dangling pointer.
 * Returns how many objects were queued.
 */
create or replace function public.queue_message_attachments_for_purge(p_message bigint)
returns integer
language plpgsql security definer set search_path = public as $function$
declare v_queued int := 0; r record;
begin
  for r in
    select f.id, f.bucket, f.path
      from public.files f
     where f.entity_type = 'channel_message' and f.entity_id = p_message::text
  loop
    /* Somebody else's live message still shows this object: leave it alone. */
    if public.attachment_has_live_reference(r.bucket, r.path) then
      continue;
    end if;
    insert into public.attachment_purge_queue (bucket, path, source_file_id, source_message_id, reason)
    values (r.bucket, r.path, r.id, p_message, 'message_deleted')
    on conflict (bucket, path) do nothing;
    v_queued := v_queued + 1;
  end loop;

  /* The file rows go once the object is spoken for: `channel_files` already
     hides them, and the queue now holds the audit (path, message, times). */
  delete from public.files
   where entity_type = 'channel_message' and entity_id = p_message::text
     and exists (select 1 from public.attachment_purge_queue q
                  where q.bucket = files.bucket and q.path = files.path);
  return v_queued;
end $function$;
revoke execute on function public.queue_message_attachments_for_purge(bigint) from public, anon;
grant execute on function public.queue_message_attachments_for_purge(bigint) to authenticated;

/**
 * A message becoming a tombstone queues what it carried, at once.
 *
 * On the row's own transaction, so there is no window where the message is
 * deleted and the object is not yet spoken for.
 */
create or replace function public.message_delete_queues_attachments() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform public.queue_message_attachments_for_purge(new.id);
  end if;
  return new;
end $function$;

drop trigger if exists messages_queue_attachment_purge on public.messages;
create trigger messages_queue_attachment_purge
  after update of deleted_at on public.messages
  for each row execute function public.message_delete_queues_attachments();

/**
 * The dry run: what a purge WOULD do, and why, before anything is deleted.
 *
 * One row per queued object — where it came from, why it is here, how many
 * live references still hold it, and the action that follows from that.
 */
create or replace function public.attachment_purge_report()
returns table (
  object_path text,
  source_message bigint,
  reason text,
  live_references integer,
  action text,
  retry_count integer,
  failure_reason text
)
language sql stable security definer set search_path = public as $function$
  select q.bucket || '/' || q.path,
         q.source_message_id,
         q.reason,
         (select count(*)::int from public.files f
           left join public.messages m on f.entity_type = 'channel_message' and m.id::text = f.entity_id
           where f.bucket = q.bucket and f.path = q.path
             and (f.entity_type <> 'channel_message' or (m.id is not null and m.deleted_at is null))),
         case
           when q.deleted_at is not null then 'already purged'
           when q.abandoned_at is not null then 'abandoned — ' || coalesce(q.failure_reason, 'unknown')
           when public.attachment_has_live_reference(q.bucket, q.path) then 'KEEP — a live message still shows it'
           else 'delete'
         end,
         q.retry_count,
         q.failure_reason
    from public.attachment_purge_queue q
   order by q.requested_at
$function$;
revoke execute on function public.attachment_purge_report() from public, anon;
grant execute on function public.attachment_purge_report() to authenticated;
comment on function public.attachment_purge_report() is
  'Dry run of the attachment purge: every queued object, why it is queued, how many live references hold it, and what the worker would do. Admin-readable; the queue table itself is not.';
