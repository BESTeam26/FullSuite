----------------------------------------------------------------------
-- 0235  The parked preview follows the ownership flag.
--
-- `can_preview_as_user` still tested `role = 'agency_owner'` — a value no
-- active membership carries since 0234 — so the owner silently lost the
-- parked View As feature the day the roles collapsed. Caught by matrix phase
-- 63 ("the owner may preview, by role: false").
--
-- The feature itself is SUPERSEDED by the deferred Login As design
-- (DEFERRED_AGENCY_WORK.md D-001) and is not being extended — this only keeps
-- the parked behavior working as documented until its replacement lands:
-- the owner always may; an admin only with the explicit grant.
----------------------------------------------------------------------

create or replace function public.can_preview_as_user()
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.agency_memberships m
     where m.user_id = auth.uid()
       and m.status = 'active'
       and (
         (m.is_owner or m.role = 'agency_owner')
         or (
           m.role = 'agency_admin'
           /* EXPLICIT. Not `agency_can`, which would hand it to every admin
              by role and defeat the old §34. */
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
