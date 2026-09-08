-- 0197 — The caller's own agency, resolved by the database.
--
-- ---------------------------------------------------------------------------
-- WHY THE CLIENT SHOULD NOT BE THE ONE HOLDING THIS
--
-- Creating a BES channel requires `agency_id` on the row, because
-- `channels_insert` asks `is_manager_of(agency_id)`. The form was taking that
-- id from the browser's auth context. When it is set, everything works. When
-- it is not — a context that has not finished loading, a view mode that is not
-- what the screen thinks, a session restored without memberships yet — the
-- insert arrives with NULL and is refused with
--
--     new row violates row-level security policy for table "channels"
--
-- which reads like a permissions problem and is not one. Dee hit it three
-- times trying to create an Announcements channel.
--
-- Rule 16 says never TRUST an id from the frontend as proof of access. The
-- other half of the same thought is not to DEPEND on one for correctness when
-- the database already knows the answer. `channels_insert` still checks
-- `is_manager_of` exactly as before — this only removes the browser's chance
-- to supply nothing.
--
-- Returns the caller's ACTIVE membership only, so a deactivated person creates
-- nothing rather than creating something the policy then refuses (0192, §33).
-- ---------------------------------------------------------------------------

create or replace function public.my_agency_id()
returns uuid
language sql stable security definer set search_path = public as $function$
  select agency_id from public.agency_memberships
   where user_id = auth.uid() and status = 'active'
   limit 1
$function$;
revoke execute on function public.my_agency_id() from public, anon;
grant execute on function public.my_agency_id() to authenticated;

comment on function public.my_agency_id() is
  'The caller''s own active agency. Not an authorization decision — the policies still ask is_manager_of. It exists so a BES channel cannot be refused merely because the browser had not resolved its own membership yet.';
