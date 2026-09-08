-- 0171 — the agency owner can delete a record outright. Nobody else can.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS, AND WHY IT IS NARROW
--
-- Dee: "Add me DELETE as Agency owner on all records. No other admin can
-- delete people records under workforce. I need to manually delete all test
-- files I am going to create."
--
-- Rule 11 says archive rather than delete where history matters, and that
-- stays the default everywhere: cancelling a service archives, retiring a
-- partner archives, a member who leaves goes inactive. This is the deliberate
-- exception, and it is shaped so it cannot become the habit:
--
--   • OWNER ONLY. Not an administrator, not by permission grant. `is_admin_of`
--     covers both roles, so this checks the role directly.
--   • ONE RECORD AT A TIME, named by table and id. There is no "delete all".
--   • AUDITED BEFORE IT HAPPENS. The audit row is written first, with the
--     record's own name in it, because afterwards there is nothing to read.
--   • REFUSES THE THINGS THAT WOULD BREAK THE AGENCY: the owner's own
--     membership, the last active owner, and any fixture the security suite
--     measures against.
--
-- What it is FOR is beta: Dee will create test partners, clients and teams to
-- try the system, and needs them gone rather than archived into the record
-- forever. Using it on a record with real history is a decision, and the
-- confirmation says what will be destroyed.
-- ---------------------------------------------------------------------------

create or replace function public.is_owner_of(p_agency uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select p_agency is not null and exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency
       and role = 'agency_owner' and status = 'active'
  )
$function$;
revoke execute on function public.is_owner_of(uuid) from public, anon;
grant execute on function public.is_owner_of(uuid) to authenticated;

comment on function public.is_owner_of(uuid) is
  'Strictly the owner role. `is_admin_of` deliberately includes administrators for day-to-day administration; destroying a record is not day-to-day.';

/**
 * Delete one record permanently.
 *
 * `p_table` is checked against a fixed list — it is interpolated into dynamic
 * SQL, and an unchecked table name there would let a caller name any table in
 * the database.
 */
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
  v_agency uuid; v_label text; v_actor text; v_extra text := ''; v_count int;
begin
  if p_table not in (
    'outsourcing_groups', 'fulfillment_clients', 'funding_clients',
    'partner_services', 'teams', 'work_items', 'agency_memberships',
    'partner_invoices', 'agency_expenses', 'partner_contacts'
  ) then
    raise exception 'Not a record this can delete: %', p_table;
  end if;

  /* One statement per table rather than one clever one: the label and the
     agency come from different columns, and a wrong guess here deletes the
     wrong row. */
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

  /* Fixtures are what the security suite measures against. Deleting one does
     not break the product; it breaks the proof that the product is safe. */
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
        if v_owners <= 1 then
          raise exception 'That is the last active owner';
        end if;
      end if;
    end;
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  /* Written BEFORE the delete, with the label in it: afterwards there is no
     row left to describe, and an audit trail that cannot say what was
     destroyed is not an audit trail (rule 10). */
  insert into public.audit_log (agency_id, actor_id, action, entity_type, entity_id, detail)
  values (v_agency, auth.uid(), 'owner.record_deleted', p_table, p_id::text,
          coalesce(v_label, '(unnamed)')
            || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), '')
            || format(' — deleted by %s', coalesce(v_actor, 'the owner')));

  execute format('delete from public.%I where id = $1', p_table) using p_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('table', p_table, 'label', v_label, 'deleted', v_count);
end;
$function$;
revoke execute on function public.owner_delete_record(text, uuid, text) from public, anon;
grant execute on function public.owner_delete_record(text, uuid, text) to authenticated;

comment on function public.owner_delete_record(text, uuid, text) is
  'Permanent deletion, owner only, one record at a time, audited before the row disappears. The exception to rule 11, not the replacement for it — archiving stays the default everywhere else.';

-- ── The delete policies the RPC needs, and nobody else gets ─────────────
--
-- The function is SECURITY DEFINER and checks the owner itself, so these
-- policies are what stops a DIRECT delete from the client. Where a table
-- already had a delete policy for admins, it stays: this only adds the owner's.
drop policy if exists agency_memberships_owner_delete on public.agency_memberships;
create policy agency_memberships_owner_delete on public.agency_memberships
  for delete to authenticated using (public.is_owner_of(agency_id));
grant delete on public.agency_memberships to authenticated;

drop policy if exists outsourcing_groups_owner_delete on public.outsourcing_groups;
create policy outsourcing_groups_owner_delete on public.outsourcing_groups
  for delete to authenticated using (public.is_owner_of(agency_id) and not is_fixture);
grant delete on public.outsourcing_groups to authenticated;

drop policy if exists partner_invoices_owner_delete on public.partner_invoices;
create policy partner_invoices_owner_delete on public.partner_invoices
  for delete to authenticated using (public.is_owner_of(agency_id));
grant delete on public.partner_invoices to authenticated;

drop policy if exists agency_expenses_owner_delete on public.agency_expenses;
create policy agency_expenses_owner_delete on public.agency_expenses
  for delete to authenticated using (public.is_owner_of(agency_id));
grant delete on public.agency_expenses to authenticated;

drop policy if exists partner_contacts_owner_delete on public.partner_contacts;
create policy partner_contacts_owner_delete on public.partner_contacts
  for delete to authenticated using (public.is_owner_of(agency_id));
grant delete on public.partner_contacts to authenticated;

/* fulfillment_clients already grants delete to an ADMIN. Dee's rule is that
   people records are owner-only; client records were already admin-deletable
   and that is left as it was, deliberately, rather than narrowed as a side
   effect of this migration. */
