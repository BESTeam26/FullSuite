-- A vault name built from the clock collides.
--
-- Fernando Serrato imported with NO vault entries at all — no SSN, no
-- logins — refused by `secrets_name_idx`. His ClickUp card carries two
-- credentials of the same kind, and `client_secret_write` names every stored
-- value:
--
--     'client_secret:' || <row id> || ':' || extract(epoch from now())
--
-- Epoch SECONDS. Write the same row twice inside one second — which an
-- import loop does easily — and the second write asks the vault for a name
-- it already holds. The whole card then fails, so a client who had a social
-- security number on file arrives with nothing.
--
-- Kendra Smith was reported during the BMF import with "two different
-- SmartCredit passwords"; this is what happens to the second one.
--
-- ── A NAME ONLY HAS TO BE UNIQUE ──────────────────────────────────────────
--
-- It is an internal key, not something anybody reads — the label, kind and
-- provider are on `client_secrets`, and the description already says what it
-- is. A timestamp made it look meaningful while making it collide; a uuid is
-- unique by construction, which is the only property the name needs.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef(
    'public.client_secret_write(uuid,text,text,text,text,text,text,text,uuid)'::regprocedure);
  v_new text;
  v_old constant text :=
E'    v_name := ''client_secret:'' || v_id::text || '':'' || extract(epoch from now())::bigint::text;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'client_secret_write does not name secrets the way this migration expects';
  end if;

  v_new := replace(v_def, v_old,
E'    /* Unique by construction. The clock was not: two writes to one row\n'
'       inside the same second asked the vault for a name it already held,\n'
'       and took the whole card down with them (2026-09-26). */\n'
'    v_name := ''client_secret:'' || v_id::text || '':'' || gen_random_uuid()::text;');
  execute v_new;
end $$;

/* Two writes to one row, back to back, in the same second. This is the exact
   sequence that lost Fernando Serrato's vault; it must now survive. */
do $$
declare v_client uuid; v_row uuid; v_owner uuid; v_secrets int;
begin
  select m.user_id into v_owner from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.is_owner and m.status = 'active' and coalesce(p.is_fixture, false) = false
   limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select c.id into v_client from public.clients c
   where c.outsourcing_group_id is not null limit 1;

  v_row := public.client_secret_write(v_client, 'monitoring', 'first-value',
    'Probe monitoring', 'ProbeProvider', 'user', null, null, null);
  v_row := public.client_secret_write(v_client, 'monitoring', 'second-value',
    'Probe monitoring', 'ProbeProvider', 'user', null, null, v_row);

  select count(*) into v_secrets from public.client_secrets
   where client_id = v_client and provider = 'ProbeProvider';
  if v_secrets = 0 then
    raise exception 'the second write still failed';
  end if;

  perform set_config('request.jwt.claims', null, true);
  raise exception 'rollback the probe';
exception when others then
  perform set_config('request.jwt.claims', null, true);
  if sqlerrm <> 'rollback the probe' then raise; end if;
end $$;

commit;
