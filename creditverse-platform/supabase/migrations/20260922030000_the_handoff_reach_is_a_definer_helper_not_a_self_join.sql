-- A policy may not query its own table: 42P17, infinite recursion.
--
-- 20260922029000 expressed "you may pass on work you hold" as an EXISTS over
-- `client_department_statuses` — inside that table's own INSERT policy. The
-- policy then had to run itself to answer itself, and every write on the table
-- failed with recursion. Caught by re-running the affected phases rather than
-- assuming the previous fix held; the symptom is unmistakable (42P17 on checks
-- that had been failing with 42501) and it lasted one migration.
--
-- The reach moves into a SECURITY DEFINER helper, which reads the table
-- without re-entering the policy. This is the same shape every other gate here
-- uses — `creditops_may_work`, `bes_engaged_with`, `can_see_partner` are all
-- definer functions for exactly this reason.
--
-- Cost impact: no material increase.

create or replace function public.creditops_works_a_department_on(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  /* Does the caller work ANY department already open on this file? That is
     what makes a handoff a handoff rather than a stranger opening a queue.
     SECURITY DEFINER so it can be read from the table's own policy without
     recursion; it discloses nothing — a boolean about the caller's own
     placement, for a client the policy has already established they can see. */
  select exists (
    select 1 from public.client_department_statuses s
     where s.client_id = p_client
       and public.creditops_may_work(s.department)
  )
$function$;

revoke execute on function public.creditops_works_a_department_on(uuid) from public, anon;
grant execute on function public.creditops_works_a_department_on(uuid) to authenticated;

drop policy if exists client_department_statuses_insert on public.client_department_statuses;
create policy client_department_statuses_insert on public.client_department_statuses
  for insert to authenticated
  with check (
    public.client_department_writable(client_department_statuses.client_id)
    and exists (select 1 from public.fulfillment_clients c
                 where c.id = client_department_statuses.client_id)
    and (
      public.creditops_may_work(client_department_statuses.department)
      or public.creditops_works_a_department_on(client_department_statuses.client_id)
      or public.is_org_member((select c.organization_id from public.fulfillment_clients c
                                where c.id = client_department_statuses.client_id))
    )
  );

comment on policy client_department_statuses_insert on public.client_department_statuses is
  'Open a department. The client must be visible, and the caller must either work '
  'that department, already work another department ON THIS FILE (which is what a '
  'handoff is), or be inside the owning organization. Deliberately looser than the '
  'UPDATE policy: passing work to a queue is not the same act as changing it. The '
  'second arm is a SECURITY DEFINER helper because a policy cannot query its own '
  'table (2026-09-22).';
