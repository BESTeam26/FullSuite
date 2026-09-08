-- 0167 — the security fixtures stop showing up in the product.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM, AND WHY IT IS NOT SOLVED BY DELETING THEM
--
-- About twenty [TEST]-prefixed rows live in this database — [TEST] Alice
-- Archer, [TEST] Summit Outsourcing, [TEST] Cedar Financial and the rest. They
-- are not sample content: they are what the RLS matrix MEASURES AGAINST. Its
-- oracles count exactly these rows to prove that a manager cannot reach a
-- partner's financials and an agent cannot reach another team's clients.
--
-- Deleting them would clean up beta and leave the security gate with nothing
-- to measure. Leaving them visible puts "[TEST] Alice Archer" in front of beta
-- testers beside real people.
--
-- So: a flag. The rows stay, exactly as they are, and the PRODUCT'S DATA LAYER
-- filters them out of every list. Two things follow, and both are deliberate:
--
--   • This is NOT a security mechanism and must never be mistaken for one.
--     It is data hygiene. Nothing here changes who may read what — RLS decides
--     that, and it is unchanged. The flag is a label, and a label is not a
--     policy (rule 1: hidden UI is presentation, not protection).
--
--   • The MATRIX must not filter on it. Its probes query the tables directly
--     as each role, so a data-layer filter in TypeScript cannot reach them.
--     That separation is the whole point: the product hides the fixtures, the
--     matrix keeps counting them.
-- ---------------------------------------------------------------------------

alter table public.outsourcing_groups  add column if not exists is_fixture boolean not null default false;
alter table public.fulfillment_clients add column if not exists is_fixture boolean not null default false;
alter table public.funding_clients     add column if not exists is_fixture boolean not null default false;
alter table public.organizations       add column if not exists is_fixture boolean not null default false;
alter table public.work_items          add column if not exists is_fixture boolean not null default false;
alter table public.profiles            add column if not exists is_fixture boolean not null default false;

comment on column public.outsourcing_groups.is_fixture is
  'A test fixture the RLS matrix measures against. Hidden from the product''s lists by the data layer. NOT a security boundary — RLS decides who may read the row, and this changes nothing about that.';

/* Marked by the convention they were created under. The prefix is the whole
   contract: a fixture is named [TEST] …, and a real record never is. */
update public.outsourcing_groups  set is_fixture = true where name  like '[[]TEST]%' and not is_fixture;
update public.fulfillment_clients set is_fixture = true where name  like '[[]TEST]%' and not is_fixture;
update public.funding_clients     set is_fixture = true where name  like '[[]TEST]%' and not is_fixture;
update public.organizations       set is_fixture = true where name  like '[[]TEST]%' and not is_fixture;
update public.work_items          set is_fixture = true where title like '[[]TEST]%' and not is_fixture;

/* The matrix's own users. They are real auth accounts with @bes.test
   addresses, created only to be measured with; a beta tester should not find
   them in the roster or be able to assign work to them. */
update public.profiles set is_fixture = true where email like '%@bes.test' and not is_fixture;

create index if not exists outsourcing_groups_real_idx  on public.outsourcing_groups (agency_id) where not is_fixture;
create index if not exists fulfillment_clients_real_idx on public.fulfillment_clients (agency_id) where not is_fixture;
create index if not exists work_items_real_idx          on public.work_items (agency_id) where not is_fixture;
