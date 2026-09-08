-- 0168 — the fixture backfill matched nothing. Fixing the pattern.
--
-- 0167 wrote `like '[[]TEST]%'`, which escapes a bracket the way SQL Server
-- does. Postgres has no bracket wildcard in LIKE, so `[` is already a literal
-- and the pattern was looking for a name beginning "[[]TEST]" — which nothing
-- is. Sixteen fixture PROFILES were flagged (their pattern used `%@bes.test`
-- and was fine); every other table silently matched zero rows.
--
-- A migration that updates nothing raises no error, which is exactly why the
-- flags were checked against the live database rather than assumed.
update public.outsourcing_groups  set is_fixture = true where name  like '[TEST]%' and not is_fixture;
update public.fulfillment_clients set is_fixture = true where name  like '[TEST]%' and not is_fixture;
update public.funding_clients     set is_fixture = true where name  like '[TEST]%' and not is_fixture;
update public.organizations       set is_fixture = true where name  like '[TEST]%' and not is_fixture;
update public.work_items          set is_fixture = true where title like '[TEST]%' and not is_fixture;
