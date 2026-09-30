-- The client directory asks "who may see whom" once, not per row.
--
-- `clients_select` was `client_visible(id)` per row: a definer lookup that
-- re-asks bes_may_fulfil() twice and is_staff_of() for every client. The
-- directory page — and the Partners and People pages, which read the same
-- table — paid 2.4 s for 1,000 rows as the owner.
--
-- The predicate is unchanged; it is evaluated as a SET. `my_visible_client_
-- ids()` (definer, so it can scan `clients` without re-entering this
-- policy) resolves the engagement test once per distinct (organization,
-- partner) pair — a few dozen — instead of once per client, and returns
-- every client id the caller may see: their own record, their
-- organization's, and the ones BES may fulfil for, if they are staff. The
-- policy is one hashed membership test. Proven per account, old policy
-- against new, every row, inside one transaction.
--
-- Cost impact: strictly less on every screen that lists clients.

begin;

create or replace function public.my_visible_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with scopes as (
    select distinct c.organization_id, c.outsourcing_group_id, c.agency_id
      from public.clients c
  ),
  fulfil as (
    select s.organization_id, s.outsourcing_group_id, s.agency_id
      from scopes s
     where public.is_staff_of(s.agency_id)
       and (public.bes_may_fulfil(s.organization_id, s.outsourcing_group_id, 'creditops')
            or public.bes_may_fulfil(s.organization_id, s.outsourcing_group_id, 'fundingops'))
  ),
  orgs as (
    select distinct s.organization_id from scopes s
     where s.organization_id is not null and public.is_org_member(s.organization_id)
  )
  select c.id
    from public.clients c
   where c.portal_user_id = auth.uid()
      or (c.organization_id is not null and c.organization_id in (select organization_id from orgs))
      or exists (select 1 from fulfil f
                  where f.organization_id is not distinct from c.organization_id
                    and f.outsourcing_group_id is not distinct from c.outsourcing_group_id
                    and f.agency_id is not distinct from c.agency_id)
$$;

revoke all on function public.my_visible_client_ids() from public;
grant execute on function public.my_visible_client_ids() to authenticated;

comment on function public.my_visible_client_ids() is
  'client_visible(id) for every client, as one set: own record, own organization''s, '
  'and the ones BES may fulfil for (staff only). The set clients_select hoists.';

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
for select to authenticated
using (id in (select public.my_visible_client_ids()));

commit;
