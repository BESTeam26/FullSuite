-- A client knows whether it is a fixture, so the directory can leave them out.
--
-- Dee, 2026-09-25: "Delete all test record". The twelve [TEST] people cannot
-- be deleted — they are what the security matrix runs on, and every check
-- names them — but her actual complaint is that she SEES them, and that is
-- fixable without touching the gate.
--
-- The CreditOps client list already filters `fulfillment_clients.is_fixture`.
-- The client DIRECTORY reads `clients`, which had no such flag, so eleven
-- fixture people have been sitting in it.
--
-- ── WHY A COLUMN AND NOT A JOIN AT EVERY CALL SITE ────────────────────────
--
-- Whether somebody is a fixture is a property of the partner or organization
-- that owns them, two tables away. Every screen that lists people would have
-- to join both and remember to — and the one that forgets is the leak. One
-- column, derived by a trigger, is a filter any query can apply and none can
-- get subtly wrong.
--
-- Derived, never typed: the trigger sets it from the owner on every insert
-- and update, so it cannot drift from the thing it describes, and setting it
-- by hand does not stick. A denormalised value nobody maintains is worse than
-- the join it replaced.
--
-- Cost impact: no material increase — a boolean and a partial index.

begin;

alter table public.clients
  add column if not exists is_fixture boolean not null default false;

comment on column public.clients.is_fixture is
  'Derived from the owning partner or organization by trigger — never set by '
  'hand. Lets real views exclude the security fixtures without joining two '
  'tables at every call site (Dee, 2026-09-25).';

create or replace function public.clients_derive_is_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.is_fixture := coalesce(
    (select g.is_fixture from public.outsourcing_groups g where g.id = new.outsourcing_group_id),
    (select o.is_fixture from public.organizations o where o.id = new.organization_id),
    false);
  return new;
end $function$;

drop trigger if exists clients_is_fixture on public.clients;
create trigger clients_is_fixture
  before insert or update of outsourcing_group_id, organization_id, is_fixture
  on public.clients
  for each row execute function public.clients_derive_is_fixture();

/* The rows already there. */
update public.clients c
   set is_fixture = coalesce(
     (select g.is_fixture from public.outsourcing_groups g where g.id = c.outsourcing_group_id),
     (select o.is_fixture from public.organizations o where o.id = c.organization_id),
     false)
 where is_fixture is distinct from coalesce(
     (select g.is_fixture from public.outsourcing_groups g where g.id = c.outsourcing_group_id),
     (select o.is_fixture from public.organizations o where o.id = c.organization_id),
     false);

create index if not exists clients_real_only_idx
  on public.clients (agency_id) where not is_fixture;

/* Every fixture-owned person is flagged, and nobody else is. Asked of the
   owner rather than of the twelve names, so a fixture partner added later is
   covered. */
do $$
declare v_missed int; v_wrong int;
begin
  select count(*) into v_missed from public.clients c
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.organizations o on o.id = c.organization_id
   where coalesce(g.is_fixture, o.is_fixture, false) and not c.is_fixture;
  select count(*) into v_wrong from public.clients c
    left join public.outsourcing_groups g on g.id = c.outsourcing_group_id
    left join public.organizations o on o.id = c.organization_id
   where not coalesce(g.is_fixture, o.is_fixture, false) and c.is_fixture;
  if v_missed > 0 or v_wrong > 0 then
    raise exception '% fixtures unflagged, % real people wrongly flagged', v_missed, v_wrong;
  end if;
end $$;

commit;
