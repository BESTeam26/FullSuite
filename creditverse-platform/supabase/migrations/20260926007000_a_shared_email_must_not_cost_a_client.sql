-- A shared email must not cost us the client.
--
-- Two Vanquish Ventures cards — Evelyn Herrera Mejia and Jermaine Hayes —
-- imported as nothing, refused by the unique index on (partner, email).
-- Each carries an email that already belongs to a DIFFERENT person under the
-- same partner.
--
-- ── THE RULE AND THE INDEX DISAGREED ──────────────────────────────────────
--
-- Dee, 2026-09-24: "2 Different names so why merge? DONT MERGE THEM." So the
-- matcher correctly refuses to fold Jermaine Hayes into whoever else holds
-- that address — and then the index refuses to let him exist at all. Between
-- them, the client vanished.
--
-- In credit repair a shared address is ordinary: a partner using one inbox
-- for several clients, a household, a spouse. Two people are still two
-- people.
--
-- ── WHY THE INDEX STAYS ───────────────────────────────────────────────────
--
-- Dropping it would make "the client with this email" ambiguous everywhere
-- it is asked — portal invitations above all, where the wrong answer sends
-- somebody else's credit report to the wrong inbox. That is a worse failure
-- than the one being fixed.
--
-- So the client is imported WITHOUT the email, and the conflict is recorded
-- on the record as a note naming the person who already holds it. Nothing is
-- lost — the address is still in the imported card text — nothing is merged,
-- and somebody can decide which of the two it really belongs to.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
  v_anchor constant text :=
E'    insert into public.clients (id, agency_id, outsourcing_group_id, mode, provenance,\n'
'      first_name, last_name, email, phone, date_of_birth,\n'
'      address_line1, city, state, postal_code, status)';
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'clickup_import_client is not the shape this migration expects';
  end if;

  v_new := replace(v_def, v_anchor,
E'    /* The email may already belong to somebody else under this partner.\n'
'       Two different people sharing an inbox is ordinary here, and Dee''s\n'
'       rule is that different names are different people — so the client is\n'
'       created WITHOUT the address rather than merged into a stranger or\n'
'       lost to a constraint (2026-09-26). */\n'
'    if nullif(p->>''email'','''') is not null and exists (\n'
'      select 1 from public.clients c2\n'
'       where c2.outsourcing_group_id = v_group\n'
'         and lower(c2.email::text) = lower(btrim(p->>''email''))) then\n'
'      select coalesce(c2.first_name, '''') || '' '' || coalesce(c2.last_name, '''')\n'
'        into v_email_holder\n'
'        from public.clients c2\n'
'       where c2.outsourcing_group_id = v_group\n'
'         and lower(c2.email::text) = lower(btrim(p->>''email''))\n'
'       limit 1;\n'
'    end if;\n\n'
    || v_anchor);

  /* The value written: null where it would collide. */
  v_new := replace(v_new,
E'      p->>''first_name'', p->>''last_name'', nullif(p->>''email'','''')::extensions.citext, p->>''phone'',',
E'      p->>''first_name'', p->>''last_name'',\n'
'      case when v_email_holder is null then nullif(p->>''email'','''')::extensions.citext end,\n'
'      p->>''phone'',');

  v_new := replace(v_new,
    '  v_may_secret boolean;',
    E'  v_may_secret boolean;\n  v_email_holder text;');

  if position('v_email_holder' in v_new) = 0 then
    raise exception 'the email-conflict handling did not land';
  end if;
  execute v_new;
end $$;

/* And the conflict is recorded where somebody will see it. */
do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
E'  perform public.import_link_record(''clickup'', ''task'', p->>''task_id'', ''fulfillment_client'', v_fc::text, null);',
E'  perform public.import_link_record(''clickup'', ''task'', p->>''task_id'', ''fulfillment_client'', v_fc::text, null);\n\n'
'  /* Said on the record, not only in an import summary that scrolls away. */\n'
'  if v_email_holder is not null then\n'
'    insert into public.activity_events\n'
'      (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility)\n'
'    values (v_agency, ''fulfillment_client'', v_fc::text, null, ''Import'',\n'
'            ''Internal note'',\n'
'            ''This client''''s ClickUp card gives the email '' || (p->>''email'') ||\n'
'            '', which already belongs to '' || btrim(v_email_holder) ||\n'
'            '' under this partner. The email was left blank here rather than '' ||\n'
'            ''merging two different people. Somebody needs to say whose it is.'',\n'
'            ''bes_internal'');\n'
'  end if;');
  execute v_new;
end $$;

commit;
