-- Restoring what 20260917002100 dropped from `suspend_partner`.
--
-- That migration set out to fix one line — the capability check read the
-- `p_actor` ARGUMENT, so anybody could pass null and skip it. But I rewrote
-- the whole function from a truncated read of it, and the rewrite silently
-- lost three things the original did:
--
--   - it held work with `held_at` / `held_reason` and skipped completed
--     items; my version wrote a column named `on_hold` and ignored completion
--   - it set `outsourcing_groups.lifecycle = 'suspended'`, which is what the
--     portal resolvers, `partner_is_suspended` and the recurring sweep all
--     read to know a partner is suspended at all
--   - it counted the held rows into the audit event
--
-- The lifecycle line is the one that mattered: without it a suspension would
-- have opened an episode and held nothing that anything else could see.
--
-- This is the ORIGINAL body from 20260913001300, with exactly one change: the
-- gate asks `auth.uid()` rather than `p_actor`.

create or replace function public.suspend_partner(
  p_group uuid, p_reason text default 'nonpayment', p_detail text default null,
  p_invoices uuid[] default '{}', p_actor uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
  v_held int;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  /* THE ONE CHANGE. `p_actor` is an argument, so gating on it let any signed-in
     person skip the check by passing null — which the reminder sweep does
     legitimately, because it has no actor. A session is the real question:
     cron and the service role have no auth.uid(). */
  if auth.uid() is not null
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
end $$;

revoke execute on function public.suspend_partner(uuid, text, text, uuid[], uuid) from public, anon;
grant execute on function public.suspend_partner(uuid, text, text, uuid[], uuid) to authenticated;
