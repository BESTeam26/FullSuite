-- Working a CreditOps file is a capability, not a side effect of a team.
--
-- Dee, 2026-09-22, correcting the authorization statement behind the new
-- client card:
--
--   "Do not derive CreditOps editability from Admin Team membership. Admin
--    Team / Management Team are organizational or communication groups. They
--    must not be authorization sources… Actions such as change status,
--    reassign, update queue/work state, correct workflow must be controlled
--    by explicit CreditOps capabilities… Do not require Dee to be artificially
--    placed in Dispute, Support, Complaints, etc. just to operate the system."
--
-- ── WHAT WAS ACTUALLY TRUE BEFORE THIS ────────────────────────────────────
--
-- Worse than described. `set_client_department_status` checked NOTHING beyond
-- being able to see the client: any BES staff member could set any status on
-- any department of any visible file. The department restriction existed only
-- in the browser, as `canLogDepartment` — which is presentation, not
-- protection (rule 1). The card looked read-only to the owner while the
-- database would have accepted the write from anybody.
--
-- ── THE LADDER DEE SET ────────────────────────────────────────────────────
--
--   Agent               their own department / team / partner scope
--   Team Lead           the teams they lead
--   Department Manager  the departments they hold a seat over
--   Division Manager    the CreditOps division they hold a seat over
--   CEO / COO           organization-wide VISIBILITY
--
-- "Operational visibility and action remain separate." So `chief_operations`
-- is deliberately absent from the mutation scope below, even though
-- `managed_divisions_for()` grants it every division for READING. Aaron sees
-- everything and changes nothing until somebody grants him the capability.
--
-- ── WHY A NEW `admin_auto` FLAG WAS NEEDED ────────────────────────────────
--
-- `resolve_agency_capability` grants every non-owner-gated key automatically
-- to `agency_owner` and `agency_admin`, and it short-circuits BEFORE reading
-- the explicit member grant — so an explicit grant could not be withheld from
-- an admin. `owner_gated` was no help either: Dee and Aaron BOTH carry
-- `is_owner`, so that flag cannot tell the Original Owner from the COO.
--
-- `admin_auto` defaults to true, so every one of the fifty-odd existing keys
-- resolves exactly as it did. Only a key that opts out falls through to the
-- explicit grants, which is what "granted explicitly" has to mean.
--
-- Money is untouched. This key lives in the CreditOps module and confers
-- nothing in Billing, finance, Partner finance or payroll — those stay
-- `owner_gated` and separate, as Dee required.

alter table public.permission_keys
  add column if not exists admin_auto boolean not null default true;

comment on column public.permission_keys.admin_auto is
  'True (the default) means the agency_owner/agency_admin roles hold this key automatically. False means it is held only by an explicit grant, so being an admin is not the same as holding it (Dee, 2026-09-22).';

create or replace function public.resolve_agency_capability(p_key text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((
    select case
      when not exists (select 1 from public.permission_keys pk where pk.key = p_key) then false
      when m.status <> 'active' then false
      when exists (select 1 from public.permission_keys pk where pk.key = p_key and pk.owner_gated)
        then coalesce(m.is_owner, false)
             or coalesce((select amp.allowed from public.agency_member_permissions amp
                           where amp.membership_id = m.id and amp.key = p_key), false)
      /* The admin short-circuit applies only to keys that opt in to it. */
      when m.role in ('agency_owner', 'agency_admin')
           and coalesce((select pk.admin_auto from public.permission_keys pk where pk.key = p_key), true)
        then true
      else coalesce(
        (select amp.allowed from public.agency_member_permissions amp
          where amp.membership_id = m.id and amp.key = p_key),
        (select app.allowed from public.agency_profile_permissions app
          where app.profile = m.access_profile and app.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id = m.agency_id and arp.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id is null and arp.key = p_key),
        false)
    end
    from public.agency_memberships m
   where m.user_id = auth.uid()
   limit 1
  ), false)
$function$;

insert into public.permission_keys (key, module, label, description, security_relevant, sort, owner_gated, admin_auto)
values ('creditops.work.manage', 'CreditOps', 'Work any CreditOps queue',
        'Change status, reassign and hand off any CreditOps file, in every department. Without it a person works only the departments their team, or a management seat, places them in. Grants nothing in finance or payroll.',
        true, 45, false, false)
on conflict (key) do update
  set module = excluded.module, label = excluded.label, description = excluded.description,
      security_relevant = excluded.security_relevant, owner_gated = excluded.owner_gated,
      admin_auto = excluded.admin_auto;

/* ── The Original Owner gets it, explicitly ───────────────────────────────
   Dee: "For the Original Owner, grant the appropriate organization-wide
   operational management capabilities explicitly… I would actually give you
   full CreditOps operational management ability as Original Owner."

   Chosen as the EARLIEST active owner membership rather than by name — rule 4
   and Dee's own standing instruction not to hardcode people into
   authorization. After this it is an ordinary row in
   `agency_member_permissions`, editable in Settings → Roles & access, so the
   grant can move without a migration. Fixture owners are excluded. */
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, 'creditops.work.manage', true
  from public.agency_memberships m
  join public.profiles p on p.id = m.user_id
 where m.is_owner and m.status = 'active'
   and coalesce(p.is_fixture, false) = false
 order by m.created_at
 limit 1
on conflict (membership_id, key) do update set allowed = true;

/* ── ONE MAPPING FROM AN ORG DEPARTMENT TO A WORK QUEUE ───────────────────
   The organization chart says how BES is STAFFED; `fulfillment_department`
   says how a FILE moves. The two vocabularies were mapped inline inside
   `my_creditops_departments`; the scope function below needs the same map for
   seats, and two copies of it is how one truth becomes several (rule 2). */
create or replace function public.creditops_departments_of(p_department_ids uuid[])
returns setof public.fulfillment_department
language sql stable security definer set search_path to 'public' as $function$
  select dep from public.departments d
  cross join lateral (
    select unnest(case d.key
             when 'onboarding'     then array['Onboarding']::public.fulfillment_department[]
             when 'dispute'        then array['Dispute']::public.fulfillment_department[]
             /* Client Success works Support AND Onboarding: onboarding is a
                stage of their work, not somebody else's department (Dee,
                2026-09-21). */
             when 'support'        then array['Support', 'Onboarding']::public.fulfillment_department[]
             when 'client_success' then array['Support', 'Onboarding']::public.fulfillment_department[]
             when 'complaints'     then array['Complaints']::public.fulfillment_department[]
             when 'bureau_calling' then array['Bureau Calling']::public.fulfillment_department[]
           end) as dep
  ) x
   where d.id = any (p_department_ids)
     and dep is not null
$function$;
revoke execute on function public.creditops_departments_of(uuid[]) from public, anon;
grant execute on function public.creditops_departments_of(uuid[]) to authenticated;

/* `my_creditops_departments` now reads that one map rather than repeating it.
   Same answer, one definition. */
create or replace function public.my_creditops_departments()
returns setof public.fulfillment_department
language sql stable security definer set search_path to 'public' as $function$
  select public.creditops_departments_of(array(select public.my_departments()))
$function$;

/**
 * Every CreditOps queue this person may CHANGE, as opposed to read.
 *
 * Deliberately not `managed_departments()`: that folds in the
 * `chief_operations` seat, which by Dee's ladder is visibility across the
 * whole organization and not authority to act on every file.
 */
create or replace function public.creditops_work_scope()
returns setof public.fulfillment_department
language sql stable security definer set search_path to 'public' as $function$
  select dep from (
    /* Organization-wide operational management, granted explicitly. */
    select unnest(enum_range(null::public.fulfillment_department)) as dep
     where public.agency_can('creditops.work.manage')
    union
    /* The departments this person's own teams place them in. */
    select public.my_creditops_departments()
    union
    /* A department manager's seats, and a division manager's departments —
       both real placements, neither of them a team they happen to sit on. */
    select public.creditops_departments_of(array(
      select d.id from public.departments d
       where d.archived_at is null
         and (exists (select 1 from public.management_seats s
                       where s.user_id = auth.uid() and s.seat = 'department_manager'
                         and s.department_id = d.id
                         and public.seat_is_live(s.effective_from, s.effective_to))
           or exists (select 1 from public.management_seats s
                       where s.user_id = auth.uid() and s.seat = 'division_manager'
                         and s.division_id = d.division_id
                         and public.seat_is_live(s.effective_from, s.effective_to)))))
  ) x
$function$;
revoke execute on function public.creditops_work_scope() from public, anon;
grant execute on function public.creditops_work_scope() to authenticated;

create or replace function public.creditops_may_work(p_department public.fulfillment_department)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.creditops_work_scope() s where s = p_department)
$function$;
revoke execute on function public.creditops_may_work(public.fulfillment_department) from public, anon;
grant execute on function public.creditops_may_work(public.fulfillment_department) to authenticated;

comment on function public.creditops_work_scope() is
  'The CreditOps queues this person may CHANGE. Capability, own team departments, department-manager seats and division-manager seats — never chief_operations, which is visibility (Dee, 2026-09-22).';
