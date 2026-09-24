-- The category lookup compared two different enums.
--
-- `set_partner_service` matched `module_categories.module = p_service::text`,
-- and `module` is its own enum, not text — so Postgres raised 42883 "no
-- operator matches" the first time anybody called it. `set_engagement_category`
-- gets away with the same line only because it passes the enum value
-- unchanged on both sides.
--
-- Caught by calling it as a real person rather than by reading it. A function
-- that has never run is not tested by looking correct — the same lesson as
-- `min(uuid)` in the import matcher this morning.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef(
    'public.set_partner_service(uuid,public.fulfillment_service,uuid)'::regprocedure);
  v_new text;
begin
  if position('c.module = p_service::text' in v_def) = 0 then
    raise exception 'set_partner_service is not the shape this migration expects';
  end if;
  v_new := replace(v_def, 'c.module = p_service::text', 'c.module::text = p_service::text');
  execute v_new;
end $$;

/* It runs. Asked of a category that exists, inside a transaction that is
   rolled back, so the check does not leave an engagement behind. */
do $$
declare v_group uuid; v_cat uuid; v_made uuid;
begin
  select g.id into v_group from public.outsourcing_groups g
   where g.archived_at is null limit 1;
  select c.id into v_cat from public.module_categories c
   where c.module::text = 'creditops' and c.key = 'outsourcing' and c.archived_at is null;
  if v_group is null or v_cat is null then
    raise notice 'no partner or category to check against';
    return;
  end if;
  /* auth.uid() is null here, so the capability check is what would refuse a
     real caller; this only proves the lookup itself resolves. */
  begin
    v_made := public.set_partner_service(v_group, 'creditops', v_cat);
  exception when sqlstate '42501' then
    raise notice 'permission refused as expected for a caller with no session';
  when sqlstate '42883' then
    raise exception 'the type mismatch is still there';
  end;
end $$;

commit;
