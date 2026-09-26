-- The same email guard, on the work file.
--
-- 20260926007000 stopped a shared email costing us the CLIENT record, and the
-- next sweep failed on `fulfillment_clients_one_email_per_partner`. There are
-- two indexes enforcing the same rule — one on the person, one on the
-- CreditOps work file — and the fix only covered the first.
--
-- Fixing one of a pair and finding the other by running it is the third time
-- today: the same shape as fixing the reader and leaving the writer, and as
-- repointing the activity rows and missing the files. Where a rule is
-- enforced twice, a fix has to be applied twice, and the way to know is to
-- run it rather than read it.
--
-- The check now looks at BOTH tables, because a collision can exist in either
-- — and the email is left blank on whichever one it would break.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
begin
  /* Detect the collision against either table. */
  v_new := replace(v_def,
E'    if nullif(p->>''email'','''') is not null and exists (\n'
'      select 1 from public.clients c2\n'
'       where c2.outsourcing_group_id = v_group\n'
'         and lower(c2.email::text) = lower(btrim(p->>''email''))) then',
E'    if nullif(p->>''email'','''') is not null and (exists (\n'
'      select 1 from public.clients c2\n'
'       where c2.outsourcing_group_id = v_group\n'
'         and lower(c2.email::text) = lower(btrim(p->>''email'')))\n'
'      or exists (\n'
'      select 1 from public.fulfillment_clients f2\n'
'       where f2.outsourcing_group_id = v_group\n'
'         and lower(f2.email::text) = lower(btrim(p->>''email'')))) then');

  /* And leave it blank on the work file too. */
  v_new := replace(v_new,
E'    values (v_fc, v_agency, v_group, v_client, ''outsourcing_only'',\n'
'      p->>''full_name'', nullif(p->>''email'','''')::extensions.citext, p->>''phone'', nullif(p->>''dob'','''')::date,',
E'    values (v_fc, v_agency, v_group, v_client, ''outsourcing_only'',\n'
'      p->>''full_name'',\n'
'      case when v_email_holder is null then nullif(p->>''email'','''')::extensions.citext end,\n'
'      p->>''phone'', nullif(p->>''dob'','''')::date,');

  if v_new = v_def then
    raise exception 'neither half of the work-file guard landed';
  end if;
  execute v_new;
end $$;

/* Both indexes are named, so neither can be forgotten again. */
do $$
declare v_found int;
begin
  select count(*) into v_found from pg_indexes
   where schemaname = 'public'
     and indexname in ('clients_one_email_per_partner',
                       'fulfillment_clients_one_email_per_partner');
  if v_found <> 2 then
    raise exception 'expected both one-email-per-partner indexes, found %', v_found;
  end if;
end $$;

commit;
