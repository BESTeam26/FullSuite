-- =============================================================================
-- Nobody could create a campaign. Not Roniel, not Kaori, not Dee.
--
-- `campaigns` was created with row-level security and two policies — and only
-- `grant select`. RLS narrows a privilege that has already been granted; it
-- does not confer one. So every insert, update and delete was refused at the
-- privilege layer before any policy was consulted:
--
--   ERROR: permission denied for table campaigns
--
-- Found by the module probe rather than by a person, which is the only reason
-- it is being fixed before the Campaigns tab was opened in anger.
--
-- The policies were always right and are untouched: reading follows the
-- workspace, writing additionally requires `marketing.tasks.manage`. This only
-- lets the policies be reached.
-- =============================================================================

grant insert, update, delete on public.campaigns to authenticated;

/* Proof, in the migration, that the capability still decides — a grant that
   accidentally opened the table to every signed-in user would pass a smoke
   test and fail an audit. */
do $$
declare v_policies int;
begin
  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename = 'campaigns';
  if v_policies < 2 then
    raise exception 'campaigns has % policies; the select and write policies must both exist', v_policies;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'campaigns'
       and policyname = 'campaigns_write'
       and qual like '%marketing.tasks.manage%') then
    raise exception 'campaigns_write no longer requires marketing.tasks.manage';
  end if;
end $$;
