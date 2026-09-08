-- 0216 — Previewing another person is never held by role alone.
--
-- ---------------------------------------------------------------------------
-- WHAT THE PROBE CAUGHT
--
-- 0215 wrote:
--
--   m.role = 'agency_admin' and public.agency_can('access.preview_as_user')
--
-- and `agency_can` says, by design: "Owner and admin hold every ordinary
-- agency capability." So the second half was always true for an admin and the
-- capability was held by ROLE — the opposite of Dee's §34, which says an
-- Agency Admin must be "explicitly granted access.preview_as_user".
--
-- The distinction matters more here than for most capabilities. Stepping into
-- somebody's account view is how you read a colleague's private conversations
-- and their partner scope; it should be given to a named person deliberately,
-- not arrive with a job title.
--
-- So the grant is read from `agency_member_permissions` DIRECTLY. That is
-- what "explicitly" means, and `agency_can` cannot express it — the role
-- shortcut is the whole point of that function everywhere else.
--
-- The owner keeps it by role. There is one owner, they are the account, and
-- withholding it from them would only mean granting it to themselves.
-- ---------------------------------------------------------------------------

create or replace function public.can_preview_as_user()
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.agency_memberships m
     where m.user_id = auth.uid()
       and m.status = 'active'
       and (
         m.role = 'agency_owner'
         or (
           m.role = 'agency_admin'
           /* EXPLICIT. Not `agency_can`, which would hand it to every admin
              by role and defeat §34. */
           and exists (
             select 1 from public.agency_member_permissions amp
              where amp.membership_id = m.id
                and amp.key = 'access.preview_as_user'
                and amp.allowed
           )
         )
       )
  )
$function$;

comment on function public.can_preview_as_user() is
  'The Agency Owner by role, or an Admin holding an EXPLICIT access.preview_as_user grant — read from agency_member_permissions rather than through agency_can, which would give it to every admin by role and defeat §34. Super Admin is that grant, not a fourth role.';
