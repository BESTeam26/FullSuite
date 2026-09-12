-- =============================================================================
-- One named answer to "may this person work this client?".
--
-- `spend_partner_credit` needs it and guessed at `can_view_work`, which has a
-- different signature and a different job. Restating the rule inline would
-- have been worse: a restated predicate drifts, and the one that governs
-- CreditOps work lives in `fulfillment_clients_update`.
--
-- So it becomes a helper, the way `can_write_work_item` already is. One place
-- to read it, one place to change it, and the credit function asks rather than
-- re-deriving.
-- =============================================================================

create or replace function public.can_work_fulfillment_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.fulfillment_clients c
     where c.id = p_client
       and (
         (c.outsourcing_group_id is not null
           and public.bes_holds_partner(c.outsourcing_group_id)
           and public.agency_can('partners.clients')
           and public.in_scope(c.agency_id, 'creditops', c.team_id, c.assigned_agent_id, c.created_by))
         or (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
           and public.in_scope(c.agency_id, 'creditops', c.team_id, c.assigned_agent_id, c.created_by))
         or (c.organization_id is not null
           and c.outsourcing_group_id is null
           and public.org_has_product(c.organization_id, 'creditOps')
           and public.org_scope_allows(c.organization_id, c.assigned_agent_id))
       )
  )
$function$;

comment on function public.can_work_fulfillment_client(uuid) is
  'Whether the caller may WORK this client — the same rule `fulfillment_clients_update` enforces, named once so nothing restates it (2026-09-13).';

revoke execute on function public.can_work_fulfillment_client(uuid) from public, anon;
grant execute on function public.can_work_fulfillment_client(uuid) to authenticated;

create or replace function public.spend_partner_credit(
  p_client uuid,
  p_unit text default 'creditops_round',
  p_quantity integer default 1,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_balance bigint;
  v_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Spend at least one credit' using errcode = '22023';
  end if;

  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then
    raise exception 'That client does not exist' using errcode = '22023';
  end if;
  if c.outsourcing_group_id is null then
    raise exception 'That client has no partner to charge' using errcode = '22023';
  end if;
  /* The caller's own right to WORK this client — never a billing right. An
     agent consuming a round must not be able to see partner money, and this
     function is the reason they do not have to. */
  if not public.can_work_fulfillment_client(p_client) then
    raise exception 'That client is not yours to work' using errcode = '42501';
  end if;

  select coalesce(sum(quantity), 0) into v_balance
    from public.partner_credit_ledger
   where group_id = c.outsourcing_group_id and unit = p_unit;

  if v_balance < p_quantity then
    raise exception 'This partner has % % credits left, and this needs %',
      v_balance, p_unit, p_quantity using errcode = '22023';
  end if;

  insert into public.partner_credit_ledger
    (agency_id, group_id, kind, unit, quantity, description, fulfillment_client_id, round, created_by)
  values (c.agency_id, c.outsourcing_group_id, 'usage', p_unit, -p_quantity,
          coalesce(p_description, c.name || ' · ' || coalesce(c.round::text, 'round')),
          c.id, c.round::text, auth.uid())
  returning id into v_id;

  perform public.log_audit('partner.credit_spent', 'partner', c.outsourcing_group_id::text, null, null,
    jsonb_build_object('client', c.id, 'unit', p_unit, 'quantity', p_quantity, 'balance_after', v_balance - p_quantity));
  return v_id;
end $function$;
revoke execute on function public.spend_partner_credit(uuid, text, integer, text) from public, anon;
grant execute on function public.spend_partner_credit(uuid, text, integer, text) to authenticated;
