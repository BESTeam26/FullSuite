-- The portal switch means off for card payments too.
--
-- `partner_group_of_user()` answers "which partner is this session?" and it
-- checks three things: an active contact, `portal_access_enabled` on the group,
-- and a lifecycle that is not suspended or archived. The comment in it is
-- explicit — "Off means off — for every policy, every my_partner_* function and
-- every row, not just the navigation."
--
-- `partner_group_of_profile()`, added in 20260917000300 so the service role
-- could ask the same question about a named person, checked only the first.
-- A partner whose portal access had been switched off, or whose account was
-- suspended, could still have started a card charge through the payments
-- function. Two functions answering one question differently is the drift rule
-- 2 exists to prevent.
--
-- Autopay is separate and deliberately so: it is BES-side automation on a card
-- the partner agreed to, not a portal action, so switching the portal off does
-- not stop it. A SUSPENDED or ARCHIVED partner is a different matter, and the
-- sweep now leaves those alone.

create or replace function public.partner_group_of_profile(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.group_id
    from public.partner_contacts c
    join public.outsourcing_groups g on g.id = c.group_id
   where c.user_id = p_user
     and c.status = 'active'
     and g.portal_access_enabled
     and g.lifecycle not in ('suspended', 'archived')
   limit 1
$$;

comment on function public.partner_group_of_profile(uuid) is
  'The partner a named person may act as. Mirrors partner_group_of_user() exactly — active contact, portal access on, lifecycle live — for callers that have no auth.uid(), such as the payments function on the service role.';

revoke all on function public.partner_group_of_profile(uuid) from public, authenticated, anon;

/* A suspended or archived partner is not autopaid. Their invoices stay owed;
   somebody decides what happens next. */
create or replace function public.partner_autopay_due()
returns table (
  group_id        uuid,
  invoice_id      uuid,
  invoice_number  text,
  amount_cents    bigint,
  currency        text,
  idempotency_key text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.group_id, i.id, i.invoice_number,
         public.invoice_balance_cents(i.id),
         i.currency,
         'autopay:' || i.id::text || ':' || public.invoice_balance_cents(i.id)::text
    from public.partner_invoices i
    join public.outsourcing_groups g on g.id = i.group_id
    join public.partner_payment_profiles p
      on p.group_id = i.group_id and p.is_default and p.autopay_enabled
   where i.status in ('sent', 'overdue', 'partially_paid')
     and i.due_date <= current_date
     and g.lifecycle not in ('suspended', 'archived')
     and public.invoice_balance_cents(i.id) > 0
   order by i.due_date, i.invoice_number
$$;

comment on function public.partner_autopay_due() is
  'Invoices autopay should charge today. The idempotency key is derived from the invoice and its balance, so a sweep that runs twice charges once. Suspended and archived partners are left alone.';

revoke all on function public.partner_autopay_due() from public, authenticated, anon;
