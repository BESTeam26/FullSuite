-- 0218 — The six notifications Dee asked for, and a defect that made one of
--        them invisible.
--
-- Dee, §14 / §59: a person must be told when they are MENTIONED, sent a
-- DIRECT MESSAGE, ASSIGNED work, HANDED a client, when an ANNOUNCEMENT is
-- published, and when something needs ATTENTION.
--
-- Measured against the live engine before writing:
--
--   assigned / unassigned   ✅ 0005 rule 1 and rule 2
--   note / comment          ✅ 0005 rule 3
--   status moved            ✅ 0005 rule 4
--   mention                 ⚠️  written, and NOT READABLE — see A below
--   direct message          ❌ nothing notified a DM with no @ in it
--   handoff                 ❌ `field = 'handoff'`, which rule 4 does not match
--   announcement            ❌ the card is posted (0200); the bell never rang
--   attention               ⚠️  reached the assignee as a generic status change
--                               and reached nobody who could act on it
--
-- ===========================================================================
-- A. THE DEFECT: A MENTION IN A BES CHANNEL NOTIFIED NOBODY
-- ===========================================================================
--
-- `notify_message_mentions` (0206) writes every channel mention with
--
--     visibility => 'organization_internal'
--
-- because it was written when a channel could only belong to an organization.
-- `notifications_select` then asks `can_view_activity(agency, org, visibility,
-- entity_type)`, and for a BES channel the arguments are (agency, NULL,
-- 'organization_internal', 'channel'):
--
--     p_org is not null and is_org_member(p_org)   → false, p_org is NULL
--     is_staff_of(p_agency)                        → true
--       case 'organization_internal'               → FALSE
--
-- So the row was inserted and no recipient could ever read it. Every @ in
-- #general and every direct message mention has been silently discarded at
-- read time. The insert succeeded, the trigger returned, nothing logged an
-- error — the only symptom was a bell that never rang.
--
-- The fix is not to widen `can_view_activity`. The visibility was simply
-- wrong: a conversation's visibility is a property of WHO OWNS IT, and that is
-- resolved once, in `channel_notice()`, for every notification about a
-- channel.
--
-- Known and deliberate gap: `can_view_activity` has no branch for an EXTERNAL
-- partner member, so a partner-side person mentioned in a partner conversation
-- still cannot read the row. Teaching that function about external memberships
-- widens a predicate used by `activity_events` as well as by notifications, so
-- it is a change to make deliberately and prove on its own, not a side effect
-- of this one. BES staff in the same conversation are notified correctly.
--
-- ===========================================================================
-- B. WHAT THIS MIGRATION DOES NOT DO
-- ===========================================================================
--
-- It does not create a second notification table, a second recipient rule, or
-- a per-user preference system. `notifications` stays one row per recipient
-- per event, written only by triggers at the two choke points that already
-- exist (`activity_events` and `messages`) plus `announcements`, which is a
-- publication event and has no activity row.
--
-- It does not notify anybody a mention or a message does not already reach:
-- `channel_notifiable` (§27) is still the gate, and it is narrower than
-- visibility on purpose.
-- ===========================================================================

----------------------------------------------------------------------
-- 1. The vocabulary
----------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention',
                  'dm', 'handoff', 'announcement', 'attention'));

/* An announcement notification is readable exactly while the announcement is
   — unpublish or archive it and the bell entry goes with it, because
   `announcements_select` stops returning the row. Default DENY means a type
   with no case here is invisible, which is why this line is required rather
   than optional (0118). */
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    -- Keyed to the organization that owns it (0059: entity_id IS the org id).
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    -- An attachment on a note is visible exactly when the note is.
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else false
  end
$function$;
revoke all on function public.entity_visible(text, text) from public, anon;
grant execute on function public.entity_visible(text, text) to authenticated;

comment on function public.entity_visible(text, text) is
  'Default DENY (0118). An entity type with no case here is not visible to anyone. Add the case — with a real check, not `true` — when you add the type. `channel_message` added in 0199, `announcement` in 0218.';

----------------------------------------------------------------------
-- 2. A conversation's own notification context
--
--    ONE place resolves which agency a channel belongs to, which
--    organization if any, and therefore which visibility a notification
--    about it must carry. Both the mention path and the direct-message path
--    read it, so they cannot disagree — which is exactly how (A) happened.
----------------------------------------------------------------------
create or replace function public.channel_notice(
  p_channel uuid,
  out agency_id uuid, out organization_id uuid,
  out visibility public.activity_visibility,
  out label text, out is_direct boolean)
language plpgsql stable security definer set search_path = public as $function$
begin
  select coalesce(c.agency_id, o.agency_id, g.agency_id),
         c.organization_id,
         case
           /* The customer's own conversation: their people read it, BES does
              not (rule 16 — association is not publication). */
           when c.organization_id is not null then 'organization_internal'
           /* A partner conversation is the one place both sides sit. */
           when c.partner_group_id is not null then 'shared_with_partner'
           else 'bes_internal'
         end::public.activity_visibility,
         c.name,
         c.kind = 'direct'
    into agency_id, organization_id, visibility, label, is_direct
    from public.channels c
    left join public.organizations o      on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.partner_group_id
   where c.id = p_channel;
end $function$;
revoke execute on function public.channel_notice(uuid) from public, anon, authenticated;

comment on function public.channel_notice(uuid) is
  'The agency, organization and ACTIVITY VISIBILITY a notification about this conversation must carry. One place, because 0206 hardcoded organization_internal and every BES-channel mention was written unreadable (0218 §A).';

----------------------------------------------------------------------
-- 3. Mentions and direct messages, from one trigger on `messages`
--
--    One choke point for the table, as `notify_from_activity` is for
--    activity. A person mentioned in a DM is told once, as a mention: the
--    stronger signal wins and there is no second row for the same message.
----------------------------------------------------------------------
create or replace function public.notify_message_recipients()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_ch       record;
  v_target   uuid;
  v_mentions uuid[] := public.mentioned_user_ids(new.body);
begin
  select * into v_ch from public.channel_notice(new.channel_id);

  /* No agency, no notification — and above all, no failed INSERT. An AFTER
     INSERT trigger that raises takes the message with it (0174, 0196, 0206). */
  if v_ch.agency_id is null then
    return new;
  end if;

  /* ── Mentions ────────────────────────────────────────────────────────── */
  foreach v_target in array v_mentions loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to reach the conversation. Naming
       somebody does not admit them to it (§27). */
    continue when not public.channel_notifiable(new.channel_id, v_target);

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_ch.agency_id, v_ch.organization_id, 'mention',
            'channel', new.channel_id::text, v_ch.label, v_ch.visibility,
            'You were mentioned', left(new.body_text, 280))
    on conflict do nothing;
  end loop;

  /* ── Direct messages ─────────────────────────────────────────────────
     A DM is addressed to a person, so it is told without an @. Members
     only: a direct channel has exactly its two participants, and
     `channel_notifiable` is re-checked so a conversation somebody has been
     removed from stops pinging them. Anybody already mentioned above is
     skipped rather than notified twice about one message. */
  if v_ch.is_direct then
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    select m.user_id, new.author_id, v_ch.agency_id, v_ch.organization_id, 'dm',
           'channel', new.channel_id::text, v_ch.label, v_ch.visibility,
           'New direct message', left(new.body_text, 280)
      from public.channel_members m
     where m.channel_id = new.channel_id
       and m.user_id <> new.author_id
       and not (m.user_id = any (coalesce(v_mentions, '{}'::uuid[])))
       and public.channel_notifiable(new.channel_id, m.user_id)
    on conflict do nothing;
  end if;

  return new;
end $function$;
revoke execute on function public.notify_message_recipients() from public, anon, authenticated;

comment on function public.notify_message_recipients() is
  'Mentions and direct messages, one trigger on `messages`. Visibility comes from channel_notice() rather than a literal, which is the whole of the 0218 §A fix.';

/* Replace the trigger and retire the narrower function. Two triggers doing
   overlapping work on one table is how one truth becomes two (rule 6). */
drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_recipients after insert on public.messages
  for each row execute function public.notify_message_recipients();
drop function if exists public.notify_message_mentions();

----------------------------------------------------------------------
-- 4. Handoff: who is told, and how the destination is found
--
--    A handoff's whole purpose is telling the NEXT department. There is no
--    department column on `teams` and inventing one would be a second way to
--    say the same thing (rule 2), so the existing route is used:
--
--      teams.department_id → departments.key
--
--    `departments.key` is the stable key the 0004 seed wrote
--    ('bureau_calling' for 'Bureau Calling'), so the enum label maps to it by
--    the same rule that produced it. Derived in ONE function: if BES ever
--    renames a department the key does not move, and if the convention
--    changes there is a single line to change.
--
--    If no team is attached to a destination department nobody extra is
--    notified. That is a missing ping, never a failure — and today 19 of the
--    21 BES seats are vacant, so this comes into its own as the team is
--    configured rather than needing to be revisited then.
----------------------------------------------------------------------
create or replace function public.fulfillment_department_key(p_department text)
returns text language sql immutable set search_path = public as $function$
  select lower(replace(trim(p_department), ' ', '_'))
$function$;
revoke execute on function public.fulfillment_department_key(text) from public, anon, authenticated;

comment on function public.fulfillment_department_key(text) is
  'The `departments.key` for a fulfillment_department label, by the same rule the 0004 seed used. One line, so a convention change has one edit site.';

create or replace function public.department_leads(p_agency uuid, p_departments text[])
returns setof uuid language sql stable security definer set search_path = public as $function$
  select distinct tm.user_id
    from public.teams t
    join public.departments d      on d.id = t.department_id
    join public.team_memberships tm on tm.team_id = t.id
   where t.agency_id = p_agency
     and t.archived_at is null
     and tm.is_lead
     and d.key = any (
       select public.fulfillment_department_key(x) from unnest(p_departments) as x
     )
$function$;
revoke execute on function public.department_leads(uuid, text[]) from public, anon, authenticated;

comment on function public.department_leads(uuid, text[]) is
  'Team leads of the teams attached to these departments. Used to tell the receiving department about a handoff; returns nothing when no team is attached, which is a missing ping rather than a failure.';

----------------------------------------------------------------------
-- 5. The activity notifier: handoff and attention added
--
--    The whole body is restated because `create or replace` on a function is
--    a rewrite, not an edit. It is copied from 0006 — the NEWEST migration
--    that touches it, not the one that created it (the 0066 lesson) — with
--    rules 5 and 6 appended and rule 4 given one conditional kind.
----------------------------------------------------------------------
create or replace function public.notify_from_activity()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_owner record;
  v_new   uuid;
  v_old   uuid;
  v_kind  text;
begin
  -- Rule 1: assignment changed → the person who gained it, the person who lost it.
  if new.action = 'Assignee changed' and new.field in ('assigned_to', 'assigned_agent_id') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    v_new := public.as_uuid(new.new_value);
    v_old := public.as_uuid(new.previous_value);
    if v_new is not null and v_new is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_new, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    if v_old is not null and v_old is distinct from new.actor_id then
      -- No detail on purpose: the row is readable after access is lost.
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_old, new.actor_id, new.agency_id, new.organization_id, 'unassigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Reassigned away from you', null)
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 2: created already assigned → the assignee.
  if new.action in ('Work item created', 'Client added') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'assigned', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, 'Assigned to you', new.detail)
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 3: a note or comment → the current assignee and the record's team leads.
  if new.action in ('Comment posted', 'Note') then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
    if v_owner.team is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      select tm.user_id, new.actor_id, new.agency_id, new.organization_id, 'note', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail
        from public.team_memberships tm
       where tm.team_id = v_owner.team
         and tm.is_lead
         and tm.user_id is distinct from new.actor_id
         and tm.user_id is distinct from v_owner.assignee
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 4: status moved by someone else → the assignee.
  --
  -- Moving INTO Attention or Blocked is not an ordinary status change: it is
  -- the one status whose meaning is "somebody has to act". It keeps the
  -- 'attention' kind so the bell can say so, and rule 6 below adds the people
  -- who can actually unblock it.
  if new.field in ('stage', 'status', 'department_status', 'deal_status') then
    v_kind := case when new.new_value in ('Attention', 'Blocked', 'Monitoring Issue')
                   then 'attention' else 'status' end;
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, v_kind, new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;

    -- Rule 6: attention reaches somebody who can act on it. An item nobody is
    -- assigned to is exactly the case a lead most needs to hear about, so this
    -- does not depend on there being an assignee.
    if v_kind = 'attention' and v_owner.team is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      select tm.user_id, new.actor_id, new.agency_id, new.organization_id, 'attention', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail
        from public.team_memberships tm
       where tm.team_id = v_owner.team
         and tm.is_lead
         and tm.user_id is distinct from new.actor_id
         and tm.user_id is distinct from v_owner.assignee
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- Rule 5: a handoff → the client's assignee, the client's team leads, and
  -- the leads of the departments the work was handed TO.
  --
  -- `new_value` is the list `handoff_client_departments` actually opened
  -- (0211), so nobody is told about a department that was already active.
  if new.field = 'handoff' then
    select * into v_owner from public.record_owner(new.entity_type, new.entity_id);
    if v_owner.assignee is not null and v_owner.assignee is distinct from new.actor_id then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
      values (v_owner.assignee, new.actor_id, new.agency_id, new.organization_id, 'handoff', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail)
      on conflict do nothing;
    end if;
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, activity_id, visibility, title, detail)
    select r.user_id, new.actor_id, new.agency_id, new.organization_id, 'handoff', new.entity_type, new.entity_id, v_owner.label, new.id, new.visibility, new.action, new.detail
      from (
        select tm.user_id
          from public.team_memberships tm
         where tm.team_id = v_owner.team and tm.is_lead
        union
        select l from public.department_leads(new.agency_id, string_to_array(coalesce(new.new_value, ''), ', ')) as l
      ) as r
     where r.user_id is distinct from new.actor_id
       and r.user_id is distinct from v_owner.assignee
    on conflict do nothing;
    return new;
  end if;

  return new;
end $function$;
revoke execute on function public.notify_from_activity() from public, anon, authenticated;

comment on function public.notify_from_activity() is
  'Recipient rules for every audited mutation. Rule 5 (handoff) and rule 6 (attention) added in 0218; rule 4 chooses its kind so moving INTO Attention is not reported as an ordinary status change.';

----------------------------------------------------------------------
-- 6. Announcements ring the bell
--
--    0200 posts an announcement into the Announcements channel as a card
--    holding no content. That is the FEED. It is not a notification: a person
--    who does not open Communication never learns the announcement exists,
--    which is what Dee reported ("the actual announcements did not come to
--    the other user").
--
--    THE TARGETING MATTERS HERE. An internal announcement is not always for
--    the whole floor: 0128 added `managers_only`, `department_id` and
--    `team_id`, and `announcements_select` narrows on all three. A notifier
--    that ignored them would write a row carrying the first 280 characters of
--    a staffing note to every agent in the agency. `notifications_select`
--    re-checks `entity_visible`, so those rows would not be READABLE — but
--    "unreadable" is not the standard to build to. `announcement_notifiable`
--    mirrors the policy for a NAMED person, the same way `channel_notifiable`
--    does for a conversation, so the row is never written in the first place.
--
--    One row per recipient, on publication only, and never on an edit — an
--    edited announcement is already correct wherever it renders, and telling
--    everyone again about a typo fix is the noisy-audit mistake (rule 10).
----------------------------------------------------------------------
create or replace function public.announcement_notifiable(p_announcement uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.announcements a
      left join public.organizations o on o.id = a.organization_id
     where a.id = p_announcement
       and a.archived_at is null
       and a.published_at is not null
       and case
         /* A customer's own announcement: its members. */
         when a.organization_id is not null then exists (
           select 1 from public.org_memberships om
            where om.organization_id = a.organization_id and om.user_id = p_user)

         /* BES to every customer: any member of any organization of the
            publishing agency. */
         when a.audience = 'all_organizations' then exists (
           select 1 from public.org_memberships om
             join public.organizations o2 on o2.id = om.organization_id
            where om.user_id = p_user
              and o2.agency_id = coalesce(a.agency_id, o.agency_id,
                    (select am.agency_id from public.agency_memberships am
                      where am.user_id = a.created_by and am.status = 'active' limit 1)))

         /* BES internal, with 0128's three narrowings applied to the NAMED
            person. `status = 'active'` as well: suspended staff are told
            nothing, the same second (0192). */
         when a.audience = 'bes_internal' then exists (
           select 1 from public.agency_memberships am
            where am.user_id = p_user
              and am.status = 'active'
              and (not a.managers_only
                   or am.role in ('agency_owner', 'agency_admin', 'agency_manager'))
              and (a.department_id is null or am.scope_department_id = a.department_id)
              and (a.team_id is null
                   or am.role in ('agency_owner', 'agency_admin', 'agency_manager')
                   or exists (select 1 from public.team_memberships tm
                               where tm.team_id = a.team_id and tm.user_id = p_user)))

         else false
       end
  )
$function$;
revoke execute on function public.announcement_notifiable(uuid, uuid) from public, anon;
grant execute on function public.announcement_notifiable(uuid, uuid) to authenticated;

comment on function public.announcement_notifiable(uuid, uuid) is
  'Whether a NAMED person may be told about this announcement. Mirrors announcements_select — including 0128''s managers_only / department / team narrowing — so a targeted announcement is not fanned out to everybody and then hidden at read time.';

create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
begin
  /* A draft is not an announcement yet, and an edit is not a new one. */
  if new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.published_at is not null then return new; end if;

  /* The announcement's own agency, the organization's, or the publisher's —
     `save_announcement` sets none of the three, so all three are tried. No
     guessing beyond that: an announcement whose agency cannot be resolved
     rings no bell rather than raising, because this trigger fires on the
     publish itself and an AFTER trigger that throws takes it with it. */
  select coalesce(
           new.agency_id,
           (select o.agency_id from public.organizations o where o.id = new.organization_id),
           (select am.agency_id from public.agency_memberships am
             where am.user_id = new.created_by and am.status = 'active' limit 1))
    into v_agency;
  if v_agency is null then return new; end if;

  /* One candidate list, then ONE authorization test. The candidates are the
     people the audience could possibly mean; `announcement_notifiable` says
     which of them it does mean. */
  insert into public.notifications
    (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
     entity_label, visibility, title, detail)
  select r.user_id, new.created_by, v_agency, r.organization_id, 'announcement',
         'announcement', new.id::text, new.title, r.visibility,
         'New announcement', left(new.body, 280)
    from (
      /* BES internal → staff of this agency, no organization on the row. */
      select am.user_id, null::uuid as organization_id, 'bes_internal'::public.activity_visibility as visibility
        from public.agency_memberships am
       where new.audience = 'bes_internal'
         and am.agency_id = v_agency and am.status = 'active'
      union all
      /* A customer's own → its members. */
      select om.user_id, om.organization_id, 'organization_internal'::public.activity_visibility
        from public.org_memberships om
       where new.audience = 'organization'
         and om.organization_id = new.organization_id
      union all
      /* BES → every customer. Each row carries THEIR organization, so
         `can_view_activity` answers for the person rather than for BES. */
      select om.user_id, om.organization_id, 'organization_internal'::public.activity_visibility
        from public.org_memberships om
        join public.organizations o on o.id = om.organization_id
       where new.audience = 'all_organizations'
         and o.agency_id = v_agency
    ) as r
   where r.user_id is distinct from new.created_by
     and public.announcement_notifiable(new.id, r.user_id)
  on conflict do nothing;

  return new;
end $function$;
revoke execute on function public.notify_announcement() from public, anon, authenticated;

comment on function public.notify_announcement() is
  'One notification per authorized recipient when an announcement is PUBLISHED. Never on an edit: the card and the page already render from the row (0200 §14), and re-announcing a typo fix is noise (rule 10).';

/* One row per person per announcement, whatever a retry or a republish does.
   `activity_id` is null here so the 0005 unique index does not apply. */
create unique index if not exists notifications_announcement_once
  on public.notifications (recipient_id, entity_id)
  where entity_type = 'announcement';

create trigger announcements_notify
  after insert or update of published_at on public.announcements
  for each row execute function public.notify_announcement();
