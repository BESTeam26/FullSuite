-- Invited people skip email confirmation (Dee, 2026-09-20: "the link already
-- came from their actual email as verification"). The activate-invitation
-- Edge Function creates the auth user already confirmed, or confirms an
-- existing one, after checking the token. It needs one lookup the client
-- API does not offer: the auth user id behind an email. Service role only.
create or replace function public.auth_user_id_for_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $function$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$function$;
revoke all on function public.auth_user_id_for_email(text) from public, anon, authenticated;
