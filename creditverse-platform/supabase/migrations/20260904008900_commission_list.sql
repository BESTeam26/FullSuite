-- 0111 — one query for the commissions list.
--
-- `commissions.party_id` deliberately has no foreign key: `party_kind` decides
-- what it points at, so it can name a partner, an organization user or an
-- agency. That is the right model, and it means PostgREST cannot embed the
-- party's name — TypeScript caught the attempt, which is the second time
-- tonight an embed that does not exist has been caught before shipping.
--
-- The alternative would be a second request per row to name each party. This
-- is one request instead (rule 14).
--
-- SECURITY INVOKER, emphatically. Every table it reads carries its own
-- row-level security and it must run as the caller so those apply — a partner
-- sees their own rows, an organization sees its own, and nobody sees anybody
-- else's. Making this definer would hand the whole table to everyone, which is
-- precisely the bug fixed in 0108 today.

create or replace function public.commission_list()
returns table (
  id uuid,
  deal_id uuid,
  party_id uuid,
  party_name text,
  state text,
  computed_amount numeric,
  basis text,
  rate_or_amount numeric,
  basis_amount numeric,
  funded_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  revenue_confirmed boolean,
  funded_deal_id uuid
)
language sql
stable
set search_path = public
as $$
  select
    c.id, c.deal_id, c.party_id,
    coalesce(nullif(trim(p.full_name), ''), p.email::text, 'Partner'),
    c.state, c.computed_amount, c.basis, c.rate_or_amount, c.basis_amount,
    c.funded_at, c.paid_at, c.payment_reference,
    fd.revenue_confirmed_at is not null,
    fd.id
  from public.commissions c
  left join public.profiles p on p.id = c.party_id
  left join public.funded_deals fd on fd.deal_id = c.deal_id
  order by c.funded_at desc nulls last, c.id
$$;
revoke all on function public.commission_list() from public, anon;
grant execute on function public.commission_list() to authenticated;
