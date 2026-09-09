----------------------------------------------------------------------
-- 0234  The GHL role model: ADMIN or USER, owner as a flag, rank retired.
--
-- Dee, 2026-09-08: "We have Agency User and Agency Admin… Position, Manager,
-- Team Lead and Job Title remain organizational structure, not application
-- security roles."
--
-- WHAT CHANGES AND WHAT DOES NOT
--
-- The five-step ladder (owner > admin > manager > team lead > agent) becomes
-- two security roles plus one flag: `agency_admin` / `agency_user`, and
-- `is_owner` for the handful of genuinely irreversible controls. Rank stops
-- being authority. What rank used to grant becomes an explicit, per-person,
-- auditable CAPABILITY (`ops.manage`), granted in this migration to exactly
-- the people who held the rank — so on the day this lands, every person can
-- do precisely what they could do yesterday, and nothing is granted by a
-- ladder nobody chose.
--
-- Scope is untouched. `in_scope` was already data (`scope` on the membership:
-- agency / division / department / team / assigned), positions were already
-- `job_title` + `position_assignments`, management relationships were already
-- `manager_id` and team leadership. §54 is preserved by construction.
--
-- NO POLICY IS EDITED HERE. The earlier audit proved no RLS policy names a
-- role literal — everything flows through the helper functions below, so
-- rewriting them carries the whole database at once, with no second copy of
-- the rule left behind to disagree.
----------------------------------------------------------------------

----------------------------------------------------------------------
-- 1. Ownership becomes a flag (§17). The role rows migrate to admin.
----------------------------------------------------------------------
alter table public.agency_memberships
  add column if not exists is_owner boolean not null default false;

comment on column public.agency_memberships.is_owner is
  'Ownership is a protected SYSTEM ATTRIBUTE, not an everyday role (Dee §17). It gates transfer, deletion and other irreversible controls. Day-to-day authority is the role: agency_admin or agency_user.';

update public.agency_memberships set is_owner = true where role = 'agency_owner';

----------------------------------------------------------------------
-- 2. The capability that replaces the manager rank.
----------------------------------------------------------------------
insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('ops.manage', 'agency', 'Operational management',
   'What the manager rank used to grant, as an explicit grant: manage workspace structure and the agency calendar, configure organization role access, write organization-scope work, and see AI economics. Admins hold it always; an Agency User holds it only when given it.', true, 5)
on conflict (key) do nothing;

----------------------------------------------------------------------
-- 3. Preserve every person's exact capabilities BEFORE collapsing roles.
--
--    Old model: member override > agency role default > platform role
--    default. The platform defaults for manager (15 allowed) and team lead
--    (6) are what those people would lose, so each affected ACTIVE member
--    gets their resolved allowances written as member overrides. Explicit
--    denials need no copying: the new role's fallback is already no.
----------------------------------------------------------------------
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, k.key, true
  from public.agency_memberships m
  cross join public.permission_keys k
 where m.role in ('agency_manager', 'agency_team_lead', 'agency_agent')
   and m.status = 'active'
   and coalesce(
         (select amp.allowed from public.agency_member_permissions amp
           where amp.membership_id = m.id and amp.key = k.key),
         (select arp.allowed from public.agency_role_permissions arp
           where arp.role = m.role and arp.agency_id = m.agency_id and arp.key = k.key),
         (select arp.allowed from public.agency_role_permissions arp
           where arp.role = m.role and arp.agency_id is null and arp.key = k.key),
         false)
   and not exists (select 1 from public.agency_member_permissions amp
                    where amp.membership_id = m.id and amp.key = k.key);

-- The rank itself, as the new capability, for the people who actually held it.
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, 'ops.manage', true
  from public.agency_memberships m
 where m.role = 'agency_manager' and m.status = 'active'
   and not exists (select 1 from public.agency_member_permissions amp
                    where amp.membership_id = m.id and amp.key = 'ops.manage');

----------------------------------------------------------------------
-- 4. Collapse the roles. Scope stays exactly as it was set.
----------------------------------------------------------------------
update public.agency_memberships set role = 'agency_admin' where role = 'agency_owner';
update public.agency_memberships set role = 'agency_user'
 where role in ('agency_manager', 'agency_team_lead', 'agency_agent');

-- Pending invitations follow the same mapping.
update public.invitations set agency_role = 'agency_admin'
 where kind = 'agency' and accepted_at is null and agency_role = 'agency_owner';
update public.invitations set agency_role = 'agency_user'
 where kind = 'agency' and accepted_at is null
   and agency_role in ('agency_manager', 'agency_team_lead', 'agency_agent');

-- Role-default rows for the retired ranks would grant by ladder if they were
-- ever consulted again; the overrides above carried their content to people.
delete from public.agency_role_permissions
 where role in ('agency_manager', 'agency_team_lead', 'agency_agent');

----------------------------------------------------------------------
-- 5. Organization side: admin stays admin; manager WAS admin in every rule
--    (`is_org_admin` accepted both), so the collapse only makes the stored
--    value say what the rules already did. The one credit_processor becomes
--    org_user with their permissions carried as member overrides.
----------------------------------------------------------------------
insert into public.member_permissions (membership_id, key, allowed)
select m.id, rp.key, rp.allowed
  from public.org_memberships m
  join public.role_permissions rp
    on rp.role = m.role and (rp.organization_id = m.organization_id or rp.organization_id is null)
 where m.role not in ('org_admin', 'org_manager', 'org_user')
   and rp.allowed
   and not exists (select 1 from public.member_permissions mp
                    where mp.membership_id = m.id and mp.key = rp.key)
on conflict do nothing;

update public.org_memberships set role = 'org_admin' where role = 'org_manager';
update public.org_memberships set role = 'org_user'
 where role not in ('org_admin', 'org_user');

----------------------------------------------------------------------
-- 6. The helpers, rewritten. Each keeps tolerating the legacy enum values —
--    an old value in a forgotten row must fail SAFE (owner treated as admin,
--    ranks treated as user), never wide.
----------------------------------------------------------------------

-- Ownership: the flag, not the role.
create or replace function public.is_owner_of(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency
       and (is_owner or role = 'agency_owner') and status = 'active'
  )
$function$;

-- The manager RANK is retired: management authority is admin, or the
-- explicit ops.manage grant. Same body for both spellings of the question.
create or replace function public.is_manager_of(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(p_agency)
      or (public.is_staff_of(p_agency) and public.resolve_agency_capability('ops.manage'))
$function$;

create or replace function public.is_agency_manager_or_above()
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_agency_admin() or public.resolve_agency_capability('ops.manage')
$function$;

comment on function public.is_manager_of(uuid) is
  'Management authority: an agency admin, or an Agency User explicitly granted ops.manage. The manager RANK is retired (0234) — nothing is held by ladder position.';

-- New people default to their own work; an admin sets a wider scope
-- deliberately on the Access page. Nothing is inferred from a ladder.
create or replace function public.default_scope_for_role(p_role public.agency_role)
returns public.access_scope language sql immutable set search_path = public as $function$
  select case
    when p_role in ('agency_admin', 'agency_owner') then 'agency'
    else 'assigned'
  end::public.access_scope
$function$;

-- Role changes: two values, owner-count guarded by the FLAG, and the flag
-- itself movable only by an owner.
create or replace function public.set_agency_member_role(p_membership uuid, p_role public.agency_role)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_actor text; v_is_owner boolean;
begin
  select m.agency_id, m.role, m.user_id, m.is_owner into v_agency, v_role, v_user, v_is_owner
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency administrator can change a role';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'The security role is Agency Admin or Agency User. Positions and teams live on the person''s profile.' using errcode = '22023';
  end if;
  if v_is_owner and p_role <> 'agency_admin' then
    raise exception 'The owner is an Agency Admin. Transfer ownership first, deliberately.';
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  /* Widening to admin sets agency scope; narrowing to user KEEPS the scope an
     admin already chose rather than silently shrinking a division manager to
     their own work. */
  update public.agency_memberships
     set role = p_role,
         scope = case when p_role = 'agency_admin' then 'agency'::public.access_scope else scope end
   where id = p_membership;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          'Role changed', 'role', v_role::text, p_role::text, 'bes_internal');
end;
$function$;

-- Deactivation: the owner FLAG is the shield now.
create or replace function public.set_agency_member_status(p_membership uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_user uuid; v_actor text; v_is_owner boolean;
begin
  select m.agency_id, m.user_id, (m.is_owner or m.role = 'agency_owner')
    into v_agency, v_user, v_is_owner
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Status must be active or inactive';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency administrator can change who is active';
  end if;
  if v_is_owner and p_status = 'inactive' then
    raise exception 'The agency owner cannot be deactivated. Transfer ownership first, deliberately.';
  end if;
  if v_user = auth.uid() and p_status = 'inactive' then
    raise exception 'You cannot deactivate yourself';
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  update public.agency_memberships
     set status = p_status,
         deactivated_at = case when p_status = 'inactive' then now() else null end,
         deactivated_by = case when p_status = 'inactive' then auth.uid() else null end
   where id = p_membership;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          case when p_status = 'inactive' then 'Member deactivated' else 'Member restored' end,
          'status', case when p_status = 'inactive' then 'active' else 'inactive' end,
          p_status, 'bes_internal');
end;
$function$;

-- Ownership moves only by an owner's own deliberate act, and never leaves
-- the agency without one.
create or replace function public.transfer_agency_ownership(p_to_membership uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_to_user uuid; v_to_status text; v_actor text;
begin
  select m.agency_id, m.user_id, m.status into v_agency, v_to_user, v_to_status
    from public.agency_memberships m where m.id = p_to_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if not public.is_owner_of(v_agency) then
    raise exception 'Only the agency owner can transfer ownership';
  end if;
  if v_to_status <> 'active' then
    raise exception 'Ownership can only be transferred to an active member';
  end if;

  update public.agency_memberships
     set is_owner = false
   where agency_id = v_agency and user_id = auth.uid();
  update public.agency_memberships
     set is_owner = true, role = 'agency_admin',
         scope = 'agency'::public.access_scope
   where id = p_to_membership;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, new_value, visibility)
  values (v_agency, 'agency_member', v_to_user::text, auth.uid(), v_actor,
          'Ownership transferred', 'is_owner', 'true', 'bes_internal');
end;
$function$;
revoke execute on function public.transfer_agency_ownership(uuid) from public, anon;
grant execute on function public.transfer_agency_ownership(uuid) to authenticated;

-- Invitations: two roles, and owner-invitation is retired — ownership is
-- transferred, never mailed.
create or replace function public.invite_agency_member(p_email text, p_role public.agency_role)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
  v_email  citext := lower(trim(p_email))::citext;
  v_id     uuid;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'Invite people as Agency Admin or Agency User. Ownership is transferred from the owner''s own account, never by invitation.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and p.email = v_email
  ) then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;

  update public.invitations
     set expires_at = now() + interval '7 days', agency_role = p_role, invited_by = auth.uid()
   where kind = 'agency' and agency_id = v_agency and email = v_email and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.invitations (email, kind, agency_id, agency_role, invited_by)
    values (v_email, 'agency', v_agency, p_role, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency_invitation.sent', 'invitation', v_id::text, null, null,
                           jsonb_build_object('email', v_email::text, 'role', p_role));
  return v_id;
end $function$;

-- Owner lookups in plumbing: the flag.
create or replace function public.ensure_default_agency_channels(p_agency uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_owner uuid;
  v_key   text;
  v_name  text;
  v_purpose text;
  v_kind  text;
  v_existing uuid;
begin
  select user_id into v_owner from public.agency_memberships
   where agency_id = p_agency and (is_owner or role = 'agency_owner') and status = 'active'
   order by created_at limit 1;

  foreach v_key in array array['general_discussion', 'announcements_updates'] loop
    v_name := case v_key when 'general_discussion' then 'General Discussion'
                         else 'Announcements and Updates' end;
    v_purpose := case v_key when 'general_discussion' then 'Everyone at BES.'
                            else 'Official BES announcements, and the conversation around them.' end;
    v_kind := case v_key when 'general_discussion' then 'general' else 'topic' end;

    if exists (select 1 from public.channels
                where agency_id = p_agency and system_key = v_key) then
      continue;
    end if;

    select id into v_existing from public.channels
     where agency_id = p_agency and system_key is null and archived_at is null
       and lower(trim(name)) = any (
         case v_key
           when 'general_discussion' then array['general', 'general discussion', 'general chat']
           else array['announcements', 'announcements and updates', 'announcements & updates']
         end)
     order by created_at limit 1;

    if v_existing is not null then
      update public.channels
         set system_key = v_key, name = v_name, open_to_scope = true
       where id = v_existing;
      continue;
    end if;

    insert into public.channels (agency_id, kind, name, purpose, created_by, open_to_scope, system_key)
    values (p_agency, v_kind::public.channel_kind, v_name, v_purpose, v_owner, true, v_key);
  end loop;
end;
$function$;

create or replace function public.post_announcement_to_communication()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_channel uuid;
  v_author  uuid;
begin
  if new.audience <> 'bes_internal' or new.published_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null then
    return new;
  end if;

  select c.id into v_channel
    from public.channels c
    join public.agencies a on a.id = c.agency_id
   where c.system_key = 'announcements_updates'
   order by c.created_at
   limit 1;
  if v_channel is null then
    return new;
  end if;

  select coalesce(new.created_by,
                  (select user_id from public.agency_memberships
                    where (is_owner or role = 'agency_owner') and status = 'active'
                    order by created_at limit 1))
    into v_author;
  if v_author is null then
    return new;
  end if;

  insert into public.messages (channel_id, author_id, body, body_text,
                               message_type, announcement_id)
  values (v_channel, v_author, '{}'::jsonb, 'Announcement', 'announcement', new.id)
  on conflict do nothing;

  return new;
end;
$function$;

create or replace function public.bootstrap_agency_owner(p_email citext, p_agency_slug citext default 'bes'::citext)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_user uuid;
  v_agency uuid;
begin
  select id into v_user from public.profiles where email = p_email;
  if v_user is null then
    raise exception 'No profile with email %. Sign up first, then run this.', p_email;
  end if;

  select id into v_agency from public.agencies where slug = p_agency_slug;
  if v_agency is null then
    insert into public.agencies (name, slug) values ('Blessed Empire Services', p_agency_slug)
    returning id into v_agency;
  end if;

  insert into public.agency_memberships (user_id, agency_id, role, is_owner, scope)
  values (v_user, v_agency, 'agency_admin', true, 'agency')
  on conflict (user_id, agency_id) do update set role = 'agency_admin', is_owner = true;

  return v_agency;
end $function$;

-- "Managers see it" on an announcement now means admins, and the people
-- actually granted management (§54): capability, not ladder.
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
         when a.organization_id is not null then exists (
           select 1 from public.org_memberships om
            where om.organization_id = a.organization_id and om.user_id = p_user)

         when a.audience = 'all_organizations' then exists (
           select 1 from public.org_memberships om
             join public.organizations o2 on o2.id = om.organization_id
            where om.user_id = p_user
              and o2.agency_id = coalesce(a.agency_id, o.agency_id,
                    (select am.agency_id from public.agency_memberships am
                      where am.user_id = a.created_by and am.status = 'active' limit 1)))

         when a.audience = 'bes_internal' then exists (
           select 1 from public.agency_memberships am
            where am.user_id = p_user
              and am.status = 'active'
              and (not a.managers_only
                   or am.role in ('agency_owner', 'agency_admin')
                   or (select c.allowed from public.agency_can_for_user(p_user, 'ops.manage') c))
              and (a.department_id is null or am.scope_department_id = a.department_id)
              and (a.team_id is null
                   or am.role in ('agency_owner', 'agency_admin')
                   or (select c.allowed from public.agency_can_for_user(p_user, 'ops.manage') c)
                   or exists (select 1 from public.team_memberships tm
                               where tm.team_id = a.team_id and tm.user_id = p_user)))

         else false
       end
  )
$function$;

-- The organization side of the same collapse: the stored value now says what
-- the rules already did (org_manager always passed is_org_admin).
create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.org_memberships
    where user_id = auth.uid() and organization_id = p_org
      and role in ('org_admin', 'org_manager')
  )
$function$;

-- Department defaults learn the generic user role: nothing by default —
-- an org admin grants departments deliberately.
create or replace function public.default_role_access(p_role public.org_role, p_product public.product_key)
returns table(departments text[], views text[], can_log_work boolean, can_edit_progress boolean, can_access_management boolean)
language sql immutable as $function$
  select
    case
      when p_product = 'creditOps' then
        case p_role
          when 'org_admin' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'org_manager' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'credit_processor' then array['Dispute']
          when 'credit_qa' then array['Onboarding','Dispute','Support','Complaints','Bureau Calling']
          when 'credit_support' then array['Support']
          when 'credit_sales' then array['Onboarding']
          when 'credit_complaints' then array['Complaints']
          when 'credit_bureau_caller' then array['Bureau Calling']
          else '{}'::text[]
        end
      when p_product = 'fundingOps' then
        case p_role
          when 'org_admin' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'org_manager' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_admin' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_manager' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_processor' then array['Readiness Review','Document Review','Lender Matching','Submissions','Stipulations','Offers','Funded Deals']
          when 'funding_doc_reviewer' then array['Document Review']
          when 'funding_underwriter' then array['Readiness Review','Lender Matching']
          when 'funding_sales' then array['Offers','Funded Deals']
          when 'funding_support' then array['Stipulations']
          else '{}'::text[]
        end
      else '{}'::text[]
    end as departments,
    '{}'::text[] as views,
    (p_role <> 'credit_qa') as can_log_work,
    (p_role in ('org_admin','org_manager','funding_admin','funding_manager')) as can_edit_progress,
    (p_role in ('org_admin','org_manager','funding_admin','funding_manager')) as can_access_management
$function$;

----------------------------------------------------------------------
-- 7. Sanity gates: this migration refuses to leave the model half-moved.
----------------------------------------------------------------------
do $verify$
declare v_bad int; v_owners int;
begin
  select count(*) into v_bad from public.agency_memberships
   where role not in ('agency_admin', 'agency_user');
  if v_bad > 0 then
    raise exception '0234 left % agency memberships on retired roles', v_bad;
  end if;
  select count(*) into v_owners from public.agency_memberships
   where is_owner and status = 'active';
  if v_owners = 0 then
    raise exception '0234 would leave the agency without an active owner';
  end if;
  select count(*) into v_bad from public.org_memberships
   where role not in ('org_admin', 'org_user');
  if v_bad > 0 then
    raise exception '0234 left % org memberships on retired roles', v_bad;
  end if;
end $verify$;
