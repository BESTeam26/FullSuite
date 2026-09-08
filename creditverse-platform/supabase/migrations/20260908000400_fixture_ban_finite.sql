-- 0181 — 'infinity' is a valid timestamp that GoTrue cannot read.
--
-- The 500 on a fixture sign-in was not the password after all. Postgres
-- accepts `banned_until = 'infinity'` happily; GoTrue reads that column into a
-- Go time value, and an infinite timestamp has no representation there. The
-- driver fails while LOADING the user, which is why the response was
--
--     HTTP 500  "Database error querying schema"
--
-- rather than a refusal — the request never reached the point of deciding.
--
-- A far-future finite timestamp bans just as completely and is a value the
-- driver can carry. Year 9999 is not a date anybody is planning around.
--
-- Worth naming the mistake: two migrations went into chasing this through the
-- password, because the error message says "querying schema" and a NULL hash
-- was the obvious suspect. The lesson is the one from the audit-signature bug
-- earlier today — the failing thing and the thing you suspect are not the same
-- until you have evidence they are.
update auth.users
   set banned_until = '9999-12-31 23:59:59+00'::timestamptz
 where email like '%@bes.test';

create or replace function public.assert_fixture_logins_disabled()
returns jsonb
language plpgsql
security definer
set search_path = auth, public, extensions as $function$
declare
  v_passwords int; v_bans int; v_identities int; v_sessions int;
  v_forever constant timestamptz := '9999-12-31 23:59:59+00';
begin
  with fixed as (
    update auth.users
       set encrypted_password = extensions.crypt(
             gen_random_uuid()::text || gen_random_uuid()::text,
             extensions.gen_salt('bf'))
     where email like '%@bes.test' and encrypted_password is null
    returning 1
  ) select count(*) into v_passwords from fixed;

  /* Finite, and far enough away to be permanent. `infinity` is what GoTrue
     cannot read (0181). */
  with fixed as (
    update auth.users set banned_until = v_forever
     where email like '%@bes.test'
       and (banned_until is null or banned_until < now() or banned_until <> v_forever)
    returning 1
  ) select count(*) into v_bans from fixed;

  with fixed as (
    delete from auth.identities i using auth.users u
     where u.id = i.user_id and u.email like '%@bes.test'
    returning 1
  ) select count(*) into v_identities from fixed;

  with fixed as (
    delete from auth.sessions s using auth.users u
     where u.id = s.user_id and u.email like '%@bes.test'
    returning 1
  ) select count(*) into v_sessions from fixed;

  return jsonb_build_object(
    'passwords_replaced', v_passwords,
    'bans_applied', v_bans,
    'identities_removed', v_identities,
    'sessions_revoked', v_sessions,
    'drift_found', (v_passwords + v_bans + v_identities + v_sessions) > 0
  );
end;
$function$;
revoke execute on function public.assert_fixture_logins_disabled() from public, anon, authenticated;
