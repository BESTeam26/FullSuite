-- The billing contact is the partner's own (Partner Portal Billing step,
-- Dee, 2026-10-01 doctrine: Billing shows "billing contact").
--
-- 1. SECURITY. partner_billing_email(p_group) — the one rule for who receives
--    invoices and receipts — was executable by any signed-in user for ANY
--    partner id: proven, a partner contact (Kaori) read another partner's
--    billing name and email. Only the three definer functions that queue
--    billing mail use it (queue_invoice_email, queue_reminder_email,
--    queue_payment_receipt); they run as the owner and are unaffected by the
--    revoke. Hidden ids are not protection (rule 1).
-- 2. my_partner_billing_contact() answers the same question for the caller's
--    own partner only, behind partner_billing_group_of_user() — so the portal
--    shows exactly the address BES's billing mail goes to, from the same rule,
--    with no second copy of it.

revoke execute on function public.partner_billing_email(uuid) from authenticated, anon, public;

create or replace function public.my_partner_billing_contact()
returns table(name text, email text)
language sql stable security definer set search_path = public as $$
  select b.name, b.email
    from public.partner_billing_email(public.partner_billing_group_of_user()) b
   where public.partner_billing_group_of_user() is not null
$$;

revoke execute on function public.my_partner_billing_contact() from anon, public;
grant execute on function public.my_partner_billing_contact() to authenticated;
