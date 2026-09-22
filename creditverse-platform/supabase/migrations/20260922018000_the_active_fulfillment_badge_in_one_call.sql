-- The services BES is actively fulfilling, for every organization at once.
--
-- Dee wants the relationship on the face of each organization:
--
--   Kevin Hernandez
--   ● Active Fulfillment
--   CreditOps · BES CRM
--
-- `organization_active_services(id)` already derives it for one. A list of
-- organizations asking that per row is an N+1 (rule 14), so this answers for
-- all of them in one call.
--
-- It returns a row only for organizations the caller may actually see, so it
-- leaks nothing the directory does not already show — the same two gates,
-- asked once.

create or replace function public.organization_services_map()
returns table (organization_id uuid, services public.fulfillment_service[])
language sql stable security definer set search_path = public as $function$
  select o.id, public.organization_active_services(o.id)
    from public.organizations o
   where public.is_org_member(o.id) or public.bes_may_see_organization(o.id)
$function$;
revoke execute on function public.organization_services_map() from public, anon;
grant execute on function public.organization_services_map() to authenticated;
