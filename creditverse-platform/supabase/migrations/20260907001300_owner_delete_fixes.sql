-- 0172 — two things phase 58 caught in 0171, both real.
--
-- ---------------------------------------------------------------------------
-- 1. THE AUDIT INSERT NEVER WORKED
--
-- `owner_delete_record` wrote its audit row into a `detail` column that
-- `audit_log` does not have — it has `before` and `after`, both jsonb. So
-- every call failed on 42703 BEFORE deleting anything.
--
-- The failure was safe (nothing was destroyed without an audit row, because
-- nothing was destroyed at all) and it was invisible until a probe called the
-- function rather than reading its source. A function that has never been run
-- has not been tested, however carefully it was written.
--
-- 2. AN ADMIN COULD DELETE A PEOPLE RECORD DIRECTLY
--
-- Dee: "No other admin can delete people records under workforce." 0171 added
-- an owner-only DELETE policy and granted DELETE — but `agency_memberships_
-- write` was already `FOR ALL` with `is_agency_admin()`, and FOR ALL includes
-- DELETE. Adding a narrow policy alongside a broad one does not narrow
-- anything: Postgres ORs permissive policies together, so the broad one wins.
--
-- The fix is to split the broad policy into the commands it was actually for.
-- An administrator still adds and changes members; only the owner deletes one.
-- ---------------------------------------------------------------------------

create or replace function public.owner_delete_record(
  p_table text,
  p_id    uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_label text; v_actor text; v_count int;
begin
  if p_table not in (
    'outsourcing_groups', 'fulfillment_clients', 'funding_clients',
    'partner_services', 'teams', 'work_items', 'agency_memberships',
    'partner_invoices', 'agency_expenses', 'partner_contacts'
  ) then
    raise exception 'Not a record this can delete: %', p_table;
  end if;

  execute format(
    'select agency_id, %s from public.%I where id = $1',
    case p_table
      when 'work_items' then 'title'
      when 'partner_invoices' then 'invoice_number'
      when 'agency_expenses' then 'vendor'
      when 'partner_contacts' then 'full_name'
      when 'agency_memberships' then '(select coalesce(p.full_name, p.email) from public.profiles p where p.id = user_id)'
      else 'name'
    end, p_table)
    into v_agency, v_label using p_id;

  if v_agency is null then raise exception 'Record not found'; end if;
  if not public.is_owner_of(v_agency) then
    raise exception 'Only the agency owner can delete a record. Everyone else archives.';
  end if;

  if p_table in ('outsourcing_groups','fulfillment_clients','funding_clients','teams','work_items') then
    execute format('select count(*) from public.%I where id = $1 and is_fixture', p_table)
      into v_count using p_id;
    if v_count > 0 then
      raise exception 'That is a security-test fixture, not a test record you made. Deleting it would leave the RLS matrix measuring nothing.';
    end if;
  end if;

  if p_table = 'agency_memberships' then
    declare v_role public.agency_role; v_user uuid; v_owners int;
    begin
      select role, user_id into v_role, v_user from public.agency_memberships where id = p_id;
      if v_user = auth.uid() then
        raise exception 'You cannot delete your own membership';
      end if;
      if v_role = 'agency_owner' then
        select count(*) into v_owners from public.agency_memberships
         where agency_id = v_agency and role = 'agency_owner' and status = 'active';
        if v_owners <= 1 then raise exception 'That is the last active owner'; end if;
      end if;
    end;
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  /* `before` — what was there. Written first: afterwards there is no row left
     to describe, and an audit trail that cannot say what was destroyed is not
     an audit trail (rule 10). */
  insert into public.audit_log (agency_id, actor_id, action, entity_type, entity_id, before)
  values (v_agency, auth.uid(), 'owner.record_deleted', p_table, p_id::text,
          jsonb_build_object(
            'label', coalesce(v_label, '(unnamed)'),
            'reason', nullif(trim(coalesce(p_reason, '')), ''),
            'deleted_by', coalesce(v_actor, 'the owner'),
            'deleted_at', now()
          ));

  execute format('delete from public.%I where id = $1', p_table) using p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('table', p_table, 'label', v_label, 'deleted', v_count);
end;
$function$;
revoke execute on function public.owner_delete_record(text, uuid, text) from public, anon;
grant execute on function public.owner_delete_record(text, uuid, text) to authenticated;

-- ── An administrator adds and changes members. Only the owner deletes one ──
drop policy if exists agency_memberships_write on public.agency_memberships;

create policy agency_memberships_insert on public.agency_memberships
  for insert to authenticated with check (public.is_agency_admin());
create policy agency_memberships_update on public.agency_memberships
  for update to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());
-- DELETE is left entirely to `agency_memberships_owner_delete` from 0171.
