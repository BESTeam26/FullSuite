-- =============================================================================
-- The sweep queues the email in the same breath as the reminder.
--
-- Dee: "Email and portal notification must come from the SAME canonical
-- reminder event." Both now happen inside the `if found` branch — the one
-- place that knows a reminder is genuinely new — so there is no path that
-- creates a reminder without its email, and none that emails without a
-- reminder to point at.
-- =============================================================================

create or replace function public.billing_reminder_sweep()
returns table(reminders_sent integer, suspensions integer, invoices_marked_overdue integer)
language plpgsql security definer set search_path = public as $function$
declare
  v_sent int := 0;
  v_susp int := 0;
  v_overdue int := 0;
  r record;
  s record;
  v_reminder uuid;
  v_balance bigint;
  v_prev_reminder timestamptz;
  v_paid_since int;
begin
  v_overdue := public.mark_overdue_invoices();

  for r in
    select i.id, i.agency_id, i.group_id, i.invoice_number, i.due_date,
           (current_date - i.due_date) as days_overdue
      from public.partner_invoices i
     where i.status in ('sent', 'partially_paid', 'overdue')
       and i.due_date < current_date
       and coalesce(i.total_cents, 0) > coalesce(i.amount_paid_cents, 0)
  loop
    for s in
      select * from public.billing_reminder_schedule
       where day_offset <= r.days_overdue
       order by sort
    loop
      insert into public.partner_invoice_reminders
        (agency_id, invoice_id, group_id, stage, days_overdue, balance_cents)
      values (r.agency_id, r.id, r.group_id, s.stage, r.days_overdue,
              public.invoice_balance_cents(r.id))
      on conflict (invoice_id, stage) do nothing
      returning id into v_reminder;

      if v_reminder is not null then
        v_sent := v_sent + 1;

        /* The email, from the same event. */
        perform public.queue_reminder_email(v_reminder);

        /* And the portal notification, for contacts who have an account. */
        insert into public.notifications
          (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
           entity_label, visibility, title, detail)
        select c.user_id, null, r.agency_id, null, 'due_soon', 'partner', r.group_id::text,
               g.name, 'shared_with_partner',
               s.label || ' · ' || r.invoice_number,
               'Invoice ' || r.invoice_number || ' was due ' || to_char(r.due_date, 'DD Mon YYYY')
                 || ' and has ' || to_char(public.invoice_balance_cents(r.id) / 100.0, 'FM999G999D00')
                 || ' outstanding.'
          from public.partner_contacts c
          join public.outsourcing_groups g on g.id = c.group_id
         where c.group_id = r.group_id and c.status = 'active' and c.user_id is not null
        on conflict do nothing;

        v_reminder := null;
      end if;
    end loop;

    if r.days_overdue >= (select day_offset from public.billing_reminder_schedule where is_final)
       and exists (select 1 from public.partner_invoice_reminders pr
                    where pr.invoice_id = r.id
                      and pr.stage = (select stage from public.billing_reminder_schedule where is_final))
       and not public.partner_is_suspended(r.group_id)
    then
      perform 1 from public.partner_invoices where id = r.id for update;

      v_balance := public.invoice_balance_cents(r.id);

      select max(pr.sent_at) into v_prev_reminder
        from public.partner_invoice_reminders pr
       where pr.invoice_id = r.id
         and pr.stage <> (select stage from public.billing_reminder_schedule where is_final);

      /* `>=`: a tie goes to the payment. */
      select count(*) into v_paid_since
        from public.partner_payments p
       where p.invoice_id = r.id
         and p.status = 'succeeded'
         and (v_prev_reminder is null or p.created_at >= v_prev_reminder);

      if v_balance > 0
         and v_paid_since = 0
         and exists (select 1 from public.partner_invoices i2
                      where i2.id = r.id
                        and i2.status in ('sent', 'partially_paid', 'overdue'))
         and not public.partner_is_suspended(r.group_id)
      then
        perform public.suspend_partner(
          r.group_id, 'nonpayment',
          'Invoice ' || r.invoice_number || ' unpaid ' || r.days_overdue || ' days after its due date',
          array[r.id], null);
        v_susp := v_susp + 1;
      end if;
    end if;
  end loop;

  return query select v_sent, v_susp, v_overdue;
end $function$;
revoke execute on function public.billing_reminder_sweep() from public, anon;
grant execute on function public.billing_reminder_sweep() to authenticated;
