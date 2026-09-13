-- =============================================================================
-- Two corrections the probe found, both about money being counted twice or
-- described wrongly.
--
-- ── 1. AN OVERPAYMENT WAS COUNTED TWICE ─────────────────────────────────────
--
-- `partner_invoice_recompute` summed the payments against an invoice without
-- capping them at its total. So $425 against a $400 invoice left
-- `amount_paid_cents = 42500` on a 40000 invoice AND $25 on the partner's
-- account — the same $25 in two places. Any report that added "collected
-- against invoices" to "held on account" would have overstated by exactly the
-- overpayment.
--
-- The invoice now records what it was owed and no more. The payment still
-- records what actually arrived, and the excess lives in the account credit
-- ledger, once.
--
-- ── 2. A RECEIPT SAID "STILL SUSPENDED" WHEN IT WASN'T ──────────────────────
--
-- The receipt is queued by an AFTER INSERT trigger on the payment, and
-- reactivation runs after the insert returns. So the receipt was composed at a
-- moment when the suspension was still open and told a partner who had just
-- settled their balance nothing about getting their team back.
--
-- Lifting a suspension now updates any receipt still waiting to go out. It is
-- deterministic and local: the lift knows it happened, and the only receipts
-- it touches are that partner's own, still pending.
-- =============================================================================

create or replace function public.partner_invoice_recompute(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_paid bigint;
  v_total bigint;
  v_status public.partner_invoice_status;
  v_due date;
  v_current public.partner_invoice_status;
begin
  if p_invoice is null then return; end if;

  select total_cents, due_date, status into v_total, v_due, v_current
    from public.partner_invoices where id = p_invoice;
  if not found then return; end if;

  select coalesce(sum(case when status = 'succeeded'
                           then greatest(amount_cents - refund_amount_cents, 0)
                           else 0 end), 0)
    into v_paid
    from public.partner_payments where invoice_id = p_invoice;

  /* An invoice records what it was OWED. Anything beyond that is the
     partner's money on account, and counting it here as well would put the
     same cents in two places. */
  if v_total > 0 then
    v_paid := least(v_paid, v_total);
  end if;

  v_status := case
    when v_current in ('void', 'cancelled') then v_current
    when v_total > 0 and v_paid >= v_total then 'paid'
    when v_paid > 0 then 'partially_paid'
    when v_current = 'draft' then 'draft'
    when v_current = 'scheduled' then 'scheduled'
    when v_due < current_date then 'overdue'
    else 'sent'
  end;

  update public.partner_invoices
     set amount_paid_cents = v_paid,
         status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = p_invoice;
end;
$function$;

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

  /* A receipt still waiting to go out should say the account is back. It was
     composed by the payment's trigger, before this ran. */
  update public.billing_email_outbox
     set payload = jsonb_set(payload, '{reactivated}', 'true'::jsonb),
         updated_at = now()
   where group_id = p_group
     and kind = 'receipt'
     and state = 'pending'
     and coalesce((payload->>'reactivated')::boolean, false) = false;

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
