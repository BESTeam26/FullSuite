-- 0083 — Mentions in notes
--
-- A mention is a node in an activity's structured `body`:
--   { "type": "mention", "attrs": { "userId": "…", "label": "…" } }
-- The plain-text `detail` keeps "@Label", so search and every older reader
-- are unaffected.
--
-- What this migration adds is the part that must live in the database: who
-- gets told. The browser sends a body; it does not send a recipient list, and
-- it cannot cause a notification for someone who should not have one.
--
-- **The rule used here is deliberately stricter than the reading rule.**
-- `can_view_activity()` answers for *the caller* (it reads `auth.uid()`), and
-- inside a trigger the caller is the author, not the person being mentioned.
-- Rather than restate that function's logic per recipient — which could drift
-- into being looser, the worst possible direction — a mention notifies only
-- when the recipient plainly belongs to the row's own scope:
--
--   * a member of the row's organization, for any visibility except
--     bes_internal;
--   * staff of the row's agency, for bes_internal and for agency-scope rows.
--
-- Anything else notifies nobody. The note still shows the name the author
-- typed, because they typed it; no notification and no disclosure follow.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention'));

/** Every distinct, well-formed mention id in a note body. */
create or replace function public.mentioned_user_ids(p_body jsonb)
returns uuid[]
language sql immutable set search_path = public as $$
  with recursive nodes(node) as (
    select p_body
    union all
    select child
      from nodes,
           lateral jsonb_array_elements(
             case when jsonb_typeof(nodes.node -> 'content') = 'array'
                  then nodes.node -> 'content' else '[]'::jsonb end
           ) as child
  )
  select coalesce(array_agg(distinct id), '{}'::uuid[])
    from (
      select (node -> 'attrs' ->> 'userId')::uuid as id
        from nodes
       where node ->> 'type' = 'mention'
         and node -> 'attrs' ->> 'userId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) found
$$;
revoke all on function public.mentioned_user_ids(jsonb) from public, anon;
grant execute on function public.mentioned_user_ids(jsonb) to authenticated;

/**
 * May this specific person be told they were mentioned on this row?
 * Stricter than reading, on purpose — see the note at the top.
 */
create or replace function public.may_notify_mention(
  p_user uuid, p_agency uuid, p_org uuid, p_visibility public.activity_visibility
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_user is null then false
    when p_visibility = 'bes_internal' then
      exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.agency_id = p_agency)
    when p_org is not null then
      exists (select 1 from public.org_memberships m where m.user_id = p_user and m.organization_id = p_org)
    else
      exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.agency_id = p_agency)
  end
$$;
revoke all on function public.may_notify_mention(uuid, uuid, uuid, public.activity_visibility) from public, anon;
grant execute on function public.may_notify_mention(uuid, uuid, uuid, public.activity_visibility) to authenticated;

/**
 * The mention notifications for one activity row. Called by the existing
 * activity trigger, which keeps its own behaviour: this only adds rows for
 * people named in the body, never removes or changes what it already sent.
 */
create or replace function public.notify_mentions(p_activity public.activity_events)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner record;
  v_target uuid;
begin
  if p_activity.body is null then
    return;
  end if;
  select * into v_owner from public.record_owner(p_activity.entity_type, p_activity.entity_id);
  foreach v_target in array public.mentioned_user_ids(p_activity.body) loop
    -- Nobody is notified about their own note.
    continue when v_target = p_activity.actor_id;
    continue when not public.may_notify_mention(v_target, p_activity.agency_id, p_activity.organization_id, p_activity.visibility);
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
    values (v_target, p_activity.actor_id, p_activity.agency_id, p_activity.organization_id, 'mention',
            p_activity.entity_type, p_activity.entity_id, v_owner.label, p_activity.id, p_activity.visibility,
            'You were mentioned', left(coalesce(p_activity.detail, ''), 280))
    on conflict do nothing;
  end loop;
end $$;
revoke all on function public.notify_mentions(public.activity_events) from public, anon;

create or replace function public.notify_mentions_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_mentions(new);
  return new;
end $$;
revoke all on function public.notify_mentions_trigger() from public, anon;

-- A trigger of its own, so `notify_from_activity()` is left exactly as it is.
--
-- The first draft of this migration restated that function's body, copied from
-- the migration that created it — which is the mistake that caused the 0066
-- incident: the live definition had moved on (it also notifies a record's
-- team), and the copy would have silently dropped that. Two AFTER INSERT
-- triggers fire in name order, so mentions are additive and nothing existing
-- is touched.
create trigger notify_mentions_from_activity after insert on public.activity_events
  for each row execute function public.notify_mentions_trigger();
