-- My three coverage-test people are still in the client directory.
--
-- On 2026-09-23 I created "ZZ COVERAGE CHECK 1/2/3" to prove the coverage
-- strip, and deleted them the same day — or thought I had. That migration
-- deleted their `fulfillment_clients` rows and never touched `clients`, so
-- three of my test records have been sitting in Dee's client directory ever
-- since, visible to her and to anybody who can see Credit by Nainoa.
--
-- Exactly the same omission as the pilot clear: deleting a work file leaves
-- the PERSON behind. That one cost seven failed imports today; this one put
-- test data in front of a real user, which is the rule Dee has already had to
-- state — "fixture/test data must never leak into real employee/client views
-- again".
--
-- Deleted by their exact ids and checked against their names, and only where
-- nothing has attached itself to them since: no work file, no funding file,
-- no vault entry, no portal login. If any of that had appeared they would be
-- somebody's record now, not mine.
--
-- The five other people without a CreditOps file are NOT touched. Selena
-- Alexander belongs to a TalentOps-only partner and correctly has no
-- CreditOps work; Jane Smith, Kaori Test, Thania Ramirez Calix and Daniuel
-- Williams predate me and are Dee's to judge. Deleting somebody's client
-- record because it looks like test data is not a call a migration makes.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_deleted int; v_attached int;
begin
  select count(*) into v_attached
    from public.clients c
   where c.first_name like 'ZZ COVERAGE CHECK%'
     and (exists (select 1 from public.fulfillment_clients fc where fc.client_id = c.id)
       or exists (select 1 from public.funding_clients f where f.client_id = c.id)
       or exists (select 1 from public.client_secrets s where s.client_id = c.id)
       or c.portal_user_id is not null);
  if v_attached > 0 then
    raise exception
      '% of them now carry real work — look before deleting', v_attached;
  end if;

  delete from public.clients c where c.first_name like 'ZZ COVERAGE CHECK%';
  get diagnostics v_deleted = row_count;
  raise notice 'removed % coverage-test people', v_deleted;
end $$;

/* Nothing named for a test is left in the directory. Asked as a shape, not as
   three ids, so the next one I forget is caught too. */
do $$
declare v_bad text;
begin
  select string_agg(c.first_name || ' ' || coalesce(c.last_name, ''), ', ') into v_bad
    from public.clients c
   where c.first_name ~* '^(zz|probe|test client)\M';
  if v_bad is not null then
    raise exception 'test records still in the client directory: %', v_bad;
  end if;
end $$;

commit;
