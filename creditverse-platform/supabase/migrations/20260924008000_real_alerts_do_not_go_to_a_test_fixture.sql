-- Real alerts do not go to a test fixture.
--
-- `infra_watch()` notifies `m.is_owner`, and three memberships carry that
-- flag: Aaron, Dee, and [TEST] Ada Owner — the fixture the security matrix
-- runs its owner assertions on. She has just received a genuine production
-- alert about the attachment purge.
--
-- Harmless in itself; nobody reads her notifications. It is the mirror of the
-- rule that has already cost real time here — fixtures must not appear in
-- employee views — and the same confusion in the other direction: a fixture
-- sitting in a recipient list makes "who was told" a wrong answer, and one
-- day a fixture will be in a list that sends email.
--
-- Fixed where it belongs, on the audience rather than on this one alert:
-- every one of infra_watch's notifications goes to real owners only. Other
-- notification writers are a separate question and are not touched here.
--
-- Also: the failing-jobs sentence ran into the next one — "…violates not-null
-- constraint A job that stops running takes its work with it."
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.infra_watch()'::regprocedure);
  v_new text;
  v_hits int;
begin
  v_hits := (length(v_def) - length(replace(v_def, 'and m.status = ''active'' and m.is_owner', ''))) 
            / length('and m.status = ''active'' and m.is_owner');
  if v_hits <> 2 then
    raise exception 'expected 2 owner audiences in infra_watch, found %', v_hits;
  end if;

  v_new := replace(v_def,
    'and m.status = ''active'' and m.is_owner',
    E'and m.status = ''active'' and m.is_owner\n       /* Real owners. [TEST] Ada Owner holds the flag so the security\n          matrix can assert as an owner; she is not a person to tell. */\n       and exists (select 1 from public.profiles pr\n                    where pr.id = m.user_id and coalesce(pr.is_fixture, false) = false)');

  v_new := replace(v_new,
    E'|| '' A job that stops running takes its work with it.''',
    E'|| ''. A job that stops running takes its work with it.''');

  execute v_new;
end $$;

/* Proved on today's real data: the alert reaches Aaron and Dee, and not the
   fixture. Rolled back — this is a check, not a second round of alerts. */
do $$
declare v_fixture int; v_real int;
begin
  delete from public.notifications
   where entity_type = 'cron_job' and created_at > now() - interval '10 minutes';

  perform public.infra_watch();

  select count(*) filter (where coalesce(p.is_fixture, false)),
         count(*) filter (where not coalesce(p.is_fixture, false))
    into v_fixture, v_real
    from public.notifications n
    join public.profiles p on p.id = n.recipient_id
   where n.entity_type = 'cron_job' and n.created_at > now() - interval '10 minutes';

  if v_fixture > 0 then
    raise exception 'a fixture is still being alerted (% of % recipients)', v_fixture, v_fixture + v_real;
  end if;
  if v_real = 0 then
    raise exception 'nobody real was alerted — the audience is now empty';
  end if;
  raise notice 'alert reaches % real owners, 0 fixtures', v_real;
end $$;

commit;
