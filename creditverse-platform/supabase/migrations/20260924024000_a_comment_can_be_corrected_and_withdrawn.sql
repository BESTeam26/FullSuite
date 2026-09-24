-- A comment can be corrected, and withdrawn.
--
-- Dee, 2026-09-24: "I CANT DELETE COMMENTS IN CREDITOPS, I should have delete
-- and edit capability."
--
-- ── WHY DELETE IS A WITHDRAWAL, NOT A DELETE ──────────────────────────────
--
-- `activity_events` has no DELETE policy and is not getting one. It is the
-- audit trail of a client file — who changed a status, who handed it on, who
-- completed the work — and rule 10 is that meaningful mutations keep their
-- actor, their time and their before-and-after. A table somebody can delete
-- rows from is not an audit trail.
--
-- So a withdrawn comment is stamped, not removed: it leaves the conversation
-- completely — Dee does not want to see it, and she will not — and the row
-- stays with who withdrew it and when. Nobody reading the file sees it; the
-- record of it having existed survives. Those are not in conflict.
--
-- ── AND ONLY A COMMENT ────────────────────────────────────────────────────
--
-- Both functions refuse anything with a `field` set. That is what separates a
-- note somebody typed from an event a trigger wrote, and it is the same test
-- the existing UPDATE policy already uses. Nobody edits "Status changed" into
-- something else.
--
-- The previous text is kept in `previous_value` on an edit, because a comment
-- on a dispute file is something a client or a regulator may one day ask
-- about, and "it used to say something else" is the question.
--
-- Cost impact: no material increase.

begin;

alter table public.activity_events
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

comment on column public.activity_events.deleted_at is
  'A comment its author (or a manager) withdrew. The row stays — this table is '
  'an audit trail — and the conversation stops showing it (Dee, 2026-09-24).';

/**
 * Correct a comment.
 *
 * Returns nothing and raises on refusal, so a caller cannot mistake "you may
 * not" for "there was nothing to change".
 */
create or replace function public.note_edit(p_id bigint, p_text text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := auth.uid(); v_row record;
begin
  if v_actor is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_text is null or btrim(p_text) = '' then
    raise exception 'A comment cannot be emptied. Delete it instead.' using errcode = '22023';
  end if;

  select id, agency_id, actor_id, field, detail, deleted_at
    into v_row from public.activity_events where id = p_id;
  if v_row.id is null then
    raise exception 'No such comment' using errcode = '22023';
  end if;
  if v_row.deleted_at is not null then
    raise exception 'That comment was deleted' using errcode = '22023';
  end if;
  if v_row.field is not null then
    /* A status change is not a comment. */
    raise exception 'That is a record of something that happened, not a comment'
      using errcode = '42501';
  end if;
  if v_row.actor_id is distinct from v_actor and not public.is_manager_of(v_row.agency_id) then
    raise exception 'Only the person who wrote a comment can change it'
      using errcode = '42501';
  end if;

  update public.activity_events
     set detail = btrim(p_text),
         /* Kept, because "it used to say something else" is the question
            somebody eventually asks about a dispute file. */
         previous_value = coalesce(previous_value, v_row.detail),
         edited_at = now()
   where id = p_id;
end $function$;

/** Withdraw a comment from the conversation. The row stays. */
create or replace function public.note_delete(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := auth.uid(); v_row record;
begin
  if v_actor is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select id, agency_id, actor_id, field, deleted_at
    into v_row from public.activity_events where id = p_id;
  if v_row.id is null then
    raise exception 'No such comment' using errcode = '22023';
  end if;
  if v_row.deleted_at is not null then return; end if;
  if v_row.field is not null then
    raise exception 'That is a record of something that happened, not a comment'
      using errcode = '42501';
  end if;
  if v_row.actor_id is distinct from v_actor and not public.is_manager_of(v_row.agency_id) then
    raise exception 'Only the person who wrote a comment can delete it'
      using errcode = '42501';
  end if;

  update public.activity_events
     set deleted_at = now(), deleted_by = v_actor
   where id = p_id;

  /* A reply is not orphaned by its parent going: it goes with the thread it
     belongs to, because a reply reading "yes, do that" under nothing is worse
     than no reply. */
  update public.activity_events
     set deleted_at = now(), deleted_by = v_actor
   where parent_id = p_id and deleted_at is null and field is null;
end $function$;

revoke execute on function public.note_edit(bigint, text) from public, anon;
revoke execute on function public.note_delete(bigint) from public, anon;
grant execute on function public.note_edit(bigint, text) to authenticated;
grant execute on function public.note_delete(bigint) to authenticated;

commit;
