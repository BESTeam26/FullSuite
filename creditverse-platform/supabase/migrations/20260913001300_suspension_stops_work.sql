-- =============================================================================
-- `Suspended - Nonpayment` becomes operationally real.
--
-- Dee: "This is the most important billing behavior… suspension should stop
-- work, not destroy work."
--
-- Before this, not one row-level policy in the database referenced a partner's
-- lifecycle. A suspended partner's clients sat in every queue and every My
-- Work exactly as before, and the only thing "suspended" changed was a badge.
--
-- ── TWO MECHANISMS, ON PURPOSE ──────────────────────────────────────────────
--
-- CreditOps queues are VIEWS, so they ask `partner_is_suspended()` directly.
-- Nothing is written, nothing can drift, and lifting a suspension restores the
-- queue in the same instant.
--
-- `work_items` is read by the client as a table (My Work), so a view filter
-- would be presentation only — and hiding work in React while the API still
-- serves it is exactly what rule 1 forbids. Those rows are HELD: `held_at` is
-- stamped and cleared. The assignment is untouched, which is Dee's §18 — "Do
-- not permanently delete assignment rows just to remove them from current
-- work."
--
-- NOTHING IS DELETED. Not the partner, not their clients, not projects, files,
-- history, agreements, invoices, payments or assignments. Management and
-- billing keep full visibility, because none of this touches a SELECT policy.
-- =============================================================================

create table if not exists public.partner_suspensions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,
  reason text not null default 'nonpayment' check (reason in ('nonpayment', 'manual', 'other')),
  detail text,
  suspended_at timestamptz not null default now(),
  /** Null when the reminder schedule did it rather than a person. */
  suspended_by uuid references public.profiles(id),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id),
  lift_reason text,
  created_at timestamptz not null default now()
);

comment on table public.partner_suspensions is
  'One row per suspension EPISODE, opened when work stops and closed when it resumes. History rather than a flag, so "why were they suspended in March?" has an answer (Dee, 2026-09-13).';

/* One open suspension per partner. Two would make "lift it" ambiguous. */
create unique index if not exists partner_suspensions_one_open
  on public.partner_suspensions (group_id) where lifted_at is null;

create table if not exists public.partner_suspension_invoices (
  suspension_id uuid not null references public.partner_suspensions(id) on delete cascade,
  invoice_id uuid not null references public.partner_invoices(id) on delete cascade,
  primary key (suspension_id, invoice_id)
);

comment on table public.partner_suspension_invoices is
  'Which invoices caused a suspension. Named rather than inferred from dates, so reactivation can check exactly those.';

alter table public.partner_suspensions enable row level security;
alter table public.partner_suspension_invoices enable row level security;
grant select on public.partner_suspensions, public.partner_suspension_invoices to authenticated;

/* Readable by anybody who may see the partner at all — an agent needs to know
   WHY the account they were working went quiet. No money is here; invoice
   amounts stay behind the owner-gated invoice policies. */
drop policy if exists partner_suspensions_select on public.partner_suspensions;
create policy partner_suspensions_select on public.partner_suspensions
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.view'));

drop policy if exists partner_suspension_invoices_select on public.partner_suspension_invoices;
create policy partner_suspension_invoices_select on public.partner_suspension_invoices
  for select to authenticated
  using (exists (select 1 from public.partner_suspensions s
                  where s.id = suspension_id
                    and public.is_staff_of(s.agency_id)
                    and public.agency_can('partners.invoices.view')));

/* No write policies: suspending and lifting go through the audited functions
   below, never through a hand-written insert. */

create or replace function public.partner_is_suspended(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_group is not null
     and exists (select 1 from public.partner_suspensions s
                  where s.group_id = p_group and s.lifted_at is null)
$function$;
revoke execute on function public.partner_is_suspended(uuid) from public, anon;
grant execute on function public.partner_is_suspended(uuid) to authenticated;

alter table public.work_items
  add column if not exists held_at timestamptz,
  add column if not exists held_reason text;

comment on column public.work_items.held_at is
  'Set while the partner this work belongs to is suspended. The assignment, the history and the record are untouched — only its presence in somebody''s day changes (Dee: "suspend/hold the work").';

create index if not exists work_items_held on public.work_items (held_at) where held_at is not null;

/**
 * Stop work for a partner, and record why.
 *
 * `p_actor` is null when the reminder schedule did it, which is how the
 * timeline distinguishes "the system suspended them on day 7" from "somebody
 * suspended them".
 *
 * Idempotent: a partner already suspended returns their open episode. The
 * Day 7 sweep runs on a schedule and must not open a second one.
 */
create or replace function public.suspend_partner(
  p_group uuid,
  p_reason text default 'nonpayment',
  p_detail text default null,
  p_invoices uuid[] default '{}',
  p_actor uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
  v_held int;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  if p_actor is not null
     and not (public.is_staff_of(g.agency_id) and public.agency_can('partners.invoices.manage')) then
    raise exception 'Suspending a partner for nonpayment is owner-granted' using errcode = '42501';
  end if;

  select id into v_id from public.partner_suspensions
   where group_id = p_group and lifted_at is null;
  if v_id is not null then return v_id; end if;

  insert into public.partner_suspensions (agency_id, group_id, reason, detail, suspended_by)
  values (g.agency_id, p_group, p_reason, p_detail, p_actor)
  returning id into v_id;

  insert into public.partner_suspension_invoices (suspension_id, invoice_id)
  select v_id, i from unnest(coalesce(p_invoices, '{}')) as i
   where exists (select 1 from public.partner_invoices pi where pi.id = i)
  on conflict do nothing;

  /* Hold the partner's open work. `assigned_to` is deliberately untouched. */
  with theirs as (
    select w.id from public.work_items w
      join public.workspaces ws on ws.id = w.workspace_id
     where ws.partner_group_id = p_group
    union
    select w.id from public.work_items w
      join public.crm_projects p on p.id::text = w.related_ref
     where p.partner_group_id = p_group
  )
  update public.work_items w
     set held_at = now(),
         held_reason = coalesce(p_detail, 'Partner suspended — ' || p_reason),
         updated_at = now()
   from theirs t
  where w.id = t.id and w.held_at is null and w.completed_at is null;
  get diagnostics v_held = row_count;

  update public.outsourcing_groups
     set lifecycle = 'suspended', updated_at = now()
   where id = p_group and lifecycle <> 'suspended';

  perform public.log_audit('partner.suspended', 'partner', p_group::text, null,
    jsonb_build_object('lifecycle', g.lifecycle),
    jsonb_build_object('reason', p_reason, 'detail', p_detail,
                       'invoices', to_jsonb(coalesce(p_invoices, '{}')),
                       'work_held', v_held, 'by', p_actor));
  return v_id;
end $function$;
revoke execute on function public.suspend_partner(uuid, text, text, uuid[], uuid) from public, anon;
grant execute on function public.suspend_partner(uuid, text, text, uuid[], uuid) to authenticated;

/**
 * Start work again.
 *
 * Releasing a hold puts the work back where it was — including who had it,
 * because the assignment was never removed. CreditOps work is then RE-ROUTED
 * rather than restored: `creditops_route_client` applies the department's
 * current assignment policy, whoever held the file in March (Dee §20).
 */
create or replace function public.lift_partner_suspension(
  p_group uuid, p_reason text default null, p_actor uuid default auth.uid()
) returns boolean
language plpgsql security definer set search_path = public as $function$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
  v_released int;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;
  if p_actor is not null
     and not (public.is_staff_of(g.agency_id) and public.agency_can('partners.invoices.manage')) then
    raise exception 'Reactivating a partner is owner-granted' using errcode = '42501';
  end if;

  select id into v_id from public.partner_suspensions
   where group_id = p_group and lifted_at is null;
  if v_id is null then return false; end if;

  update public.partner_suspensions
     set lifted_at = now(), lifted_by = p_actor, lift_reason = p_reason
   where id = v_id;

  update public.work_items w
     set held_at = null, held_reason = null, updated_at = now()
   where w.held_at is not null
     and (exists (select 1 from public.workspaces ws
                   where ws.id = w.workspace_id and ws.partner_group_id = p_group)
       or exists (select 1 from public.crm_projects p
                   where p.id::text = w.related_ref and p.partner_group_id = p_group));
  get diagnostics v_released = row_count;

  update public.outsourcing_groups
     set lifecycle = 'active', updated_at = now()
   where id = p_group and lifecycle = 'suspended';

  perform public.creditops_route_client(c.id, null)
     from public.fulfillment_clients c
    where c.outsourcing_group_id = p_group
      and c.archived_at is null
      and coalesce(c.lifecycle, 'active') = 'active';

  perform public.log_audit('partner.reactivated', 'partner', p_group::text, null,
    jsonb_build_object('suspension', v_id),
    jsonb_build_object('reason', p_reason, 'work_released', v_released, 'by', p_actor));
  return true;
end $function$;
revoke execute on function public.lift_partner_suspension(uuid, text, uuid) from public, anon;
grant execute on function public.lift_partner_suspension(uuid, text, uuid) to authenticated;

-- ── The queues stop showing them ───────────────────────────────────────────
create or replace view public.creditops_my_work as
  select s.client_id, c.name as client_name, c.public_id as client_public_id,
         c.organization_id, c.outsourcing_group_id,
         coalesce(o.name, g.name) as partner_name,
         c.round, c.status as credit_status, s.department, s.status as work_status,
         s.assignee_id, s.assignment_method,
         coalesce(s.manual_due_at, s.system_due_at) as due_at,
         s.updated_at, c.next_action
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.creditops_status_routing r on r.status = c.status
   where s.assignee_id is not null
     and coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     and public.creditops_status_is_actionable(s.department, s.status)
     and coalesce(r.kind, 'actionable') <> 'partner_action'
     and not public.partner_is_suspended(c.outsourcing_group_id);

create or replace view public.creditops_department_queue as
  select s.client_id, s.department, s.status as work_status, c.status as credit_status,
         c.name as client_name, c.email as client_email, c.phone as client_phone,
         c.public_id as client_public_id, c.round, c.agency_id, c.organization_id,
         c.outsourcing_group_id, coalesce(o.name, g.name) as partner_name,
         coalesce(c.organization_id, c.outsourcing_group_id) as partner_scope_id,
         s.assignee_id, coalesce(p.full_name, p.email::text) as assignee_name,
         s.assignment_method, coalesce(s.manual_due_at, s.system_due_at) as due_at,
         s.blocked_reason, s.updated_at,
         public.creditops_status_is_actionable(s.department, s.status) as actionable,
         not public.creditops_status_is_actionable(s.department, s.status) as waiting
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    left join public.organizations o on o.id = c.organization_id
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.profiles p on p.id = s.assignee_id
   where coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     and upper(btrim(s.status)) <> all (array['BC NOT NEEDED','BC COMPLETED','CM NOT NEEDED',
       'CM COMPLETED','SUPPORT RESOLVED','OB READY FOR R1','PARTNER ENDORSED','COMPLETED','ARCHIVED / INACTIVE'])
     and not public.partner_is_suspended(c.outsourcing_group_id);

create or replace view public.creditops_assignment_required as
  select s.client_id, c.name as client_name, c.agency_id, c.organization_id,
         c.outsourcing_group_id, s.department, s.status,
         coalesce(s.manual_due_at, s.system_due_at) as due_at, s.updated_at
    from public.client_department_statuses s
    join public.fulfillment_clients c on c.id = s.client_id
    join public.departments d on d.agency_id = c.agency_id
      and d.division = 'creditops' and d.archived_at is null
      and d.key = case s.department
        when 'Onboarding' then 'onboarding' when 'Dispute' then 'dispute'
        when 'Support' then 'support' when 'Complaints' then 'complaints'
        when 'Bureau Calling' then 'bureau_calling' else null end
   where s.assignee_id is null
     and d.assignment_mode = 'auto_equal'
     and coalesce(c.lifecycle, 'active') = 'active'
     and c.archived_at is null
     and public.creditops_status_is_actionable(s.department, s.status)
     and not public.partner_is_suspended(c.outsourcing_group_id);

alter view public.creditops_my_work set (security_invoker = true);
alter view public.creditops_department_queue set (security_invoker = true);
alter view public.creditops_assignment_required set (security_invoker = true);
