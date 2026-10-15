-- The handoff row check decides for itself.
--
-- creditops_department_row_exists() (20261015007000) is SECURITY DEFINER and
-- asked client_department_writable(), an INVOKER helper, whether the caller
-- may write the client. The structural rule in the matrix (phase 47) is
-- that no definer may lean on an invoker helper — a helper whose honesty
-- depends on the caller's row security is not a check once it runs with the
-- definer's rights. The helper's own predicate is explicit (BES staff of the
-- client's agency, or a member of its organization), so the function now
-- states it directly, with the two definer helpers that read auth.uid().
-- Same answer for every caller; no reliance on anything but auth.uid().
--
-- Cost impact: none.

create or replace function public.creditops_department_row_exists(
  p_client uuid, p_department public.fulfillment_department)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.fulfillment_clients c
     where c.id = p_client
       and (public.is_staff_of(c.agency_id) or public.is_org_member(c.organization_id)))
     and exists (select 1 from public.client_department_statuses s
                  where s.client_id = p_client and s.department = p_department)
$$;
