-- create-team-member needs to know whether an address already has an auth
-- row before it makes a shell one, so an existing person is reused rather
-- than duplicated. Service role only — no browser can enumerate addresses.
create or replace function public.auth_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $function$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$function$;
revoke all on function public.auth_user_by_email(text) from public, anon, authenticated;
