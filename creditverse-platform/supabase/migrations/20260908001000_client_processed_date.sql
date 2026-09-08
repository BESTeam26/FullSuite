-- 0187 — the columns Dee actually works from, and their audit trail.
--
-- Dee's live dispute board carries: Assignee, Status, Latest comment, Current
-- Round, Processed Date, Due date, Days Before Next Update, Email — and every
-- one of them is editable from the row, ClickUp-style, with the change logged.
--
-- Most of that already exists. `fulfillment_clients` has status, round,
-- assigned_agent_id, due_at, email, and its activity trigger already records a
-- change to status, assignee, round, email and phone.
--
-- Two gaps:
--
--   PROCESSED DATE — when the current round was actually worked. Distinct from
--   `last_activity_at` (which any touch moves) and from `due_at` (which is a
--   promise, not a fact). Nothing derived it, so it is a column.
--
--   NO AUDIT ON DATES. The trigger watched five fields and neither date was
--   among them. A due date is a promise about work; moving one silently is
--   exactly the kind of change somebody needs to be able to see later.
--
-- "Days Before Next Update" stays DERIVED — due date minus today. Storing it
-- would be wrong by tomorrow, which is the same mistake ClickUp's own "Days
-- Active" formula field avoids.
alter table public.fulfillment_clients
  add column if not exists processed_on date;

comment on column public.fulfillment_clients.processed_on is
  'When the current round was actually processed. Not last_activity_at, which any touch moves, and not due_at, which is a promise rather than a fact.';

create index if not exists fulfillment_clients_due_idx
  on public.fulfillment_clients (agency_id, due_at) where archived_at is null;

-- ── The dates now leave a trail, like every other edited field ──────────
create or replace function public.fulfillment_client_activity()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_actor text;
  v_org   uuid;
begin
  select coalesce(full_name, email) into v_actor
    from public.profiles where id = auth.uid();
  v_org := new.organization_id;

  if tg_op = 'INSERT' then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Client added', new.name, new.status::text, 'shared_with_partner');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Status changed', old.status::text || ' → ' || new.status::text,
            'status', old.status::text, new.status::text, 'shared_with_partner');
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Assignee changed',
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = old.assigned_agent_id), 'Unassigned')
            || ' → ' ||
            coalesce((select coalesce(full_name, email) from public.profiles
                       where id = new.assigned_agent_id), 'Unassigned'),
            'assigned_agent_id',
            old.assigned_agent_id::text, new.assigned_agent_id::text, 'bes_internal');
  end if;

  if new.round is distinct from old.round then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Round changed', old.round::text || ' → ' || new.round::text,
            'round', old.round::text, new.round::text, 'shared_with_partner');
  end if;

  /* New: a due date is a promise about work, and moving one is a decision
     somebody will want to see later. */
  if new.due_at is distinct from old.due_at then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Due date changed',
            coalesce(to_char(old.due_at, 'DD Mon YYYY'), 'none') || ' → ' ||
            coalesce(to_char(new.due_at, 'DD Mon YYYY'), 'none'),
            'due_at', old.due_at::text, new.due_at::text, 'shared_with_partner');
  end if;

  if new.processed_on is distinct from old.processed_on then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Processed date changed',
            coalesce(to_char(old.processed_on, 'DD Mon YYYY'), 'none') || ' → ' ||
            coalesce(to_char(new.processed_on, 'DD Mon YYYY'), 'none'),
            'processed_on', old.processed_on::text, new.processed_on::text, 'shared_with_partner');
  end if;

  if new.email is distinct from old.email then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Email address changed', 'email', 'shared_with_partner');
  end if;

  if new.phone is distinct from old.phone then
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, visibility)
    values (new.agency_id, v_org, 'fulfillment_client', new.id::text, auth.uid(), v_actor,
            'Contact updated', 'Phone number changed', 'phone', 'shared_with_partner');
  end if;

  return new;
end
$function$;
