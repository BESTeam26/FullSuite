-- An archived ClickUp card imports as history, not as work.
--
-- Dee, 2026-09-23, on Tiffany Hunter's thirteen archived cards: leave them in
-- ClickUp. On 2026-09-26: "I know i ask before not to include them, i change
-- my mind. I want everything in clickup now."
--
-- Sixty-six archived cards across the four lists already imported:
--
--   Approve with Tiff      13
--   EDP Management Group   24
--   Business Made Fair     29
--   Kevin Hernandez         0
--
-- ── THEY ARRIVE ARCHIVED, AND THAT IS THE WHOLE POINT ─────────────────────
--
-- The reason for leaving them out was never that the records are unwanted —
-- it was that a dozen finished clients in front of agents is a dozen files
-- nobody is working. So they come across with `lifecycle = 'archived'`, which
-- takes them out of every department queue, out of My Work and out of the
-- assignment engine, while the person, their history, their documents and
-- their vault entries are all kept.
--
-- Bringing a finished client's RECORD over is not the same as putting a
-- finished client in somebody's queue. This migration is the difference.
--
-- The card's own last status is kept in `source_status`, so "why is this
-- archived" is answerable without opening ClickUp.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
begin
  if position('breach_equifax, breach_npd, security_freeze_only)' in v_def) = 0 then
    raise exception 'clickup_import_client is not the shape this migration expects';
  end if;

  /* On create: the lifecycle goes in with the row. */
  v_new := replace(v_def,
E'      breach_equifax, breach_npd, security_freeze_only)',
E'      breach_equifax, breach_npd, security_freeze_only,\n'
'      lifecycle, archived_at)');

  v_new := replace(v_new,
E'      (p->>''breach_equifax'')::boolean, (p->>''breach_npd'')::boolean,\n'
'      coalesce((p->>''security_freeze_only'')::boolean, false));',
E'      (p->>''breach_equifax'')::boolean, (p->>''breach_npd'')::boolean,\n'
'      coalesce((p->>''security_freeze_only'')::boolean, false),\n'
'      /* Archived in ClickUp means archived here: kept whole, and out of\n'
'         every queue (Dee, 2026-09-26). */\n'
'      case when coalesce((p->>''archived'')::boolean, false)\n'
'           then ''archived''::public.client_lifecycle else ''active'' end,\n'
'      case when coalesce((p->>''archived'')::boolean, false) then now() end);');

  /* On re-import: a card archived since the last run becomes archived here,
     and one UN-archived in ClickUp comes back to life. */
  v_new := replace(v_new,
E'      security_freeze_only = coalesce((p->>''security_freeze_only'')::boolean, security_freeze_only),',
E'      security_freeze_only = coalesce((p->>''security_freeze_only'')::boolean, security_freeze_only),\n'
'      lifecycle = case when coalesce((p->>''archived'')::boolean, false)\n'
'                       then ''archived''::public.client_lifecycle\n'
'                       /* Only lift an archive this import set. A client\n'
'                          somebody archived HERE is not ClickUp''s to\n'
'                          reopen. */\n'
'                       when lifecycle = ''archived'' and archived_at is not null\n'
'                            and p->>''archived'' is not null\n'
'                       then ''active''::public.client_lifecycle\n'
'                       else lifecycle end,\n'
'      archived_at = case when coalesce((p->>''archived'')::boolean, false)\n'
'                         then coalesce(archived_at, now()) else archived_at end,');

  if position('archived' in v_new) = 0 then
    raise exception 'the archive handling did not land';
  end if;
  execute v_new;
end $$;

/* It runs, and an archived payload produces an archived client that reaches
   no queue. Rolled back — this is a check, not an import. */
do $$
declare v_group uuid; v_result jsonb; v_fc uuid; v_queued int; v_life text; v_owner uuid;
begin
  select id into v_group from public.outsourcing_groups
   where source_list_ref is not null and archived_at is null limit 1;

  /* The import refuses a caller with no session, so the check speaks as a
     real person who holds the capability — which is also the only way it
     tests what an actual import does. */
  select m.user_id into v_owner from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.is_owner and m.status = 'active' and coalesce(p.is_fixture, false) = false
   limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_result := public.clickup_import_client(jsonb_build_object(
    'group_id', v_group, 'task_id', 'probe-archived-' || gen_random_uuid()::text,
    'full_name', 'Probe Archived', 'first_name', 'Probe', 'last_name', 'Archived',
    'status', 'Inactive / Canceled', 'round', 'Pre-Round', 'archived', true));

  v_fc := (v_result->>'fulfillment_client_id')::uuid;
  select lifecycle::text into v_life from public.fulfillment_clients where id = v_fc;
  if v_life <> 'archived' then
    raise exception 'an archived card imported as %', v_life;
  end if;

  select count(*) into v_queued from public.creditops_department_queue where client_id = v_fc;
  if v_queued > 0 then
    raise exception 'an archived client reached % queue(s)', v_queued;
  end if;

  perform set_config('request.jwt.claims', null, true);
  raise notice 'archived cards import archived and reach no queue';
  raise exception 'rollback the probe';
exception when others then
  perform set_config('request.jwt.claims', null, true);
  if sqlerrm <> 'rollback the probe' then raise; end if;
end $$;

commit;
