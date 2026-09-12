-- =============================================================================
-- @mentions in the client Notes & Instructions field.
--
-- Dee, 2026-09-12: "I also want this to have mention capability just like the
-- ClickUp."
--
-- ── WHY A SECOND COLUMN AND NOT A PARSER ────────────────────────────────────
--
-- `fulfillment_clients.description` is plain text and stays plain text: the
-- client list, search, exports and every existing reader keep working, and a
-- note written before today is still a note. Beside it, `description_body`
-- holds the same note as a document whose mentions are NODES carrying a user
-- id — the shape `activity_events.body` has used since mentions existed.
--
-- The alternative, resolving "@Dan" back to a person at notification time, is
-- how the wrong Dan gets told. Two people share a first name the day the
-- second one is hired.
--
-- ── WHY A TRIGGER AND NOT A FUNCTION ────────────────────────────────────────
--
-- Who may edit a client's notes is already decided, in one place, by the
-- `fulfillment_clients_update` policy. A SECURITY DEFINER save function would
-- have to restate that predicate, and a restated predicate drifts. An AFTER
-- UPDATE trigger runs only once the row-level check has already passed, so it
-- never has to ask the question again — it only sends what the successful
-- write earned.
--
-- Only NEWLY ADDED mentions notify. Fixing a typo in a note that names three
-- people must not tell those three people again, and it is the difference
-- between a mention people read and a mention people mute.
-- =============================================================================

alter table public.fulfillment_clients
  add column if not exists description_body jsonb;

comment on column public.fulfillment_clients.description_body is
  'Notes & Instructions as a structured document, so an @mention is a node carrying a user id rather than text to be re-parsed. `description` stays the plain-text mirror every other reader uses (Dee, 2026-09-12).';

/**
 * Tell the people newly named in a client's notes.
 *
 * Reuses the canonical mention helpers — `mentioned_user_ids` for who was
 * named and `may_notify_mention` for whether they are allowed to know this
 * record exists. There is no second mention system here, only a second place
 * mentions can be written.
 */
create or replace function public.notify_client_note_mentions()
returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  v_target uuid;
  v_before uuid[] := public.mentioned_user_ids(old.description_body);
  v_actor  uuid   := auth.uid();
  v_label  text;
begin
  if new.description_body is null then return null; end if;

  foreach v_target in array public.mentioned_user_ids(new.description_body) loop
    continue when v_target = v_actor;                 -- never your own note
    continue when v_target = any (v_before);          -- already told, on an earlier save
    /* Notes live on a BES record, so the agency membership is the test —
       `visibility => 'bes_internal'` says exactly that. A partner contact
       cannot be named here, and would not be notified if they were. */
    continue when not public.may_notify_mention(v_target, new.agency_id, null, 'bes_internal');

    select label into v_label from public.record_owner('fulfillment_client', new.id::text);

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values
      (v_target, v_actor, new.agency_id, null, 'mention', 'fulfillment_client', new.id::text,
       v_label, 'bes_internal', 'You were mentioned in client notes',
       left(coalesce(new.description, ''), 280))
    on conflict do nothing;
  end loop;
  return null;
end $function$;

revoke execute on function public.notify_client_note_mentions() from public, anon, authenticated;

drop trigger if exists fulfillment_clients_note_mentions on public.fulfillment_clients;
create trigger fulfillment_clients_note_mentions
  after update of description_body on public.fulfillment_clients
  for each row
  when (new.description_body is distinct from old.description_body)
  execute function public.notify_client_note_mentions();
