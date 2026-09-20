-- Dee, 2026-09-20: partner billing must be granted, not inherited — and
-- "Aaron is my husband and co-founder, he sees everything."
--
-- Every other money key was already explicit-only; these two were not, so
-- any administrator could read a partner's financial terms simply for being
-- an administrator. They join the rest: held by the owner, or by a named
-- grant, and by nobody else.
update public.permission_keys set owner_gated = true
 where key in ('partners.financials.view', 'partners.financials.edit');

-- Aaron, co-founder: the whole financial picture, by explicit grant rather
-- than by his admin role — so the rule holds and the reason is on the record.
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, k, true
  from public.agency_memberships m
  join public.profiles p on p.id = m.user_id,
       unnest(array['finance.dashboard.view', 'expenses.view', 'expenses.manage',
                    'partners.financials.view', 'partners.financials.edit',
                    'partners.invoices.view', 'partners.invoices.manage',
                    'partners.payments.record', 'partners.revenue.record']) as k
 where p.email = 'aaron@blessedempireservices.com'
on conflict (membership_id, key) do update set allowed = true;
