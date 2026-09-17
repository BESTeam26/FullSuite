-- The partner's own card, read the way the rest of the portal reads things.
--
-- Every `my_partner_*` function takes no id. That is the whole security model
-- of the portal: there is nothing to guess with, so there is no way to ask
-- about somebody else. `partner_payment_profiles` already has an RLS policy
-- that would do the job, but a screen written against a plain select is one
-- policy change away from leaking, and every other portal screen reads a
-- function. One convention.
--
-- It returns what is safe to show and nothing else: a brand, four digits, an
-- expiry, whether autopay is on and when it was agreed to. There is no card
-- number to return.

create or replace function public.my_partner_card()
returns table (
  id                 uuid,
  card_brand         text,
  last4              text,
  exp_month          smallint,
  exp_year           smallint,
  autopay_enabled    boolean,
  autopay_enabled_at timestamptz,
  autopay_enabled_by text,
  added_at           timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.card_brand, p.last4, p.exp_month, p.exp_year,
         p.autopay_enabled, p.autopay_enabled_at,
         (select pr.full_name from public.profiles pr where pr.id = p.autopay_enabled_by),
         p.created_at
    from public.partner_payment_profiles p
   where p.group_id = public.partner_billing_group_of_user()
     and p.is_default
$$;

comment on function public.my_partner_card() is
  'The signed-in partner''s saved card, as a brand and four digits. Takes no id, like every my_partner_* function, so there is nothing to guess with. Uses the BILLING resolver, which admits a suspended partner — settling the bill is the one thing suspension must not block.';

revoke all on function public.my_partner_card() from public;
grant execute on function public.my_partner_card() to authenticated;

/* The partner needs to know which of their invoices autopay will take, and
   when — the portal says "AutoPay scheduled for Sep 20" and that has to be
   true rather than assumed from the due date. */
create or replace function public.my_partner_autopay_schedule()
returns table (
  invoice_id     uuid,
  invoice_number text,
  due_date       date,
  amount_cents   bigint,
  will_charge    boolean,
  reason         text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select public.partner_billing_group_of_user() as g),
  card as (
    select p.autopay_enabled from public.partner_payment_profiles p, me
     where p.group_id = me.g and p.is_default
  )
  select i.id, i.invoice_number, i.due_date, public.invoice_balance_cents(i.id),
         coalesce((select autopay_enabled from card), false)
           and not exists (select 1 from public.partner_card_charges c
                            where c.invoice_id = i.id
                              and c.status in ('pending', 'unknown', 'held_for_review')),
         case
           when not coalesce((select autopay_enabled from card), false) then 'AutoPay is off'
           when exists (select 1 from public.partner_card_charges c
                         where c.invoice_id = i.id and c.status in ('pending', 'unknown', 'held_for_review'))
             then 'A payment on this invoice is being confirmed'
           else null
         end
    from public.partner_invoices i, me
   where i.group_id = me.g
     and i.status in ('sent', 'overdue', 'partially_paid')
     and public.invoice_balance_cents(i.id) > 0
   order by i.due_date
$$;

comment on function public.my_partner_autopay_schedule() is
  'Which of the partner''s open invoices autopay will take, and when — so the portal can say so rather than infer it from a due date.';

revoke all on function public.my_partner_autopay_schedule() from public;
grant execute on function public.my_partner_autopay_schedule() to authenticated;
