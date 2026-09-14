-- 0344 — the directory widened, the QUEUES must not have.
--
-- ---------------------------------------------------------------------------
-- A CONSEQUENCE OF 0343 THAT 0343 DID NOT INTEND
--
-- Dee, 2026-09-13: "KEEP QUEUES NARROW. Department queues must still use
-- operational scope: user → active team membership → department → department
-- work."
--
-- 0343 widened `fulfillment_clients_select` so authorized CreditOps staff can
-- read the shared directory. Measured immediately afterwards, Ivan's
-- department-work count went from 0 to 30 — every queue row in the system,
-- not just Complaints.
--
-- The path, which 0343 did not look at:
--
--   client_department_statuses_select  =  client_department_writable(client_id)
--   client_department_writable          =  SECURITY INVOKER, and it SELECTS
--                                          from fulfillment_clients
--
-- Being INVOKER, RLS applies inside it — so it answered "can you see the
-- client?", and the moment the client became visible the whole queue came with
-- it. A predicate named `_writable` was also gating a READ, which is how the
-- conflation survived review.
--
-- ── THE RULE, RESTORED ─────────────────────────────────────────────────────
--
-- Seeing a client and working their queue are different permissions:
--
--   directory  →  division placement + creditops.clients.view   (0343)
--   queue      →  the DEPARTMENT you are actually in            (here)
--
-- A Complaints agent sees every client in the directory and only Complaints
-- rows in the queues. That is exactly the pair Dee described.
-- ---------------------------------------------------------------------------

-- ── My departments, in the vocabulary the queue rows use ────────────────
--
-- `departments.key` is a slug (`bureau_calling`); `client_department_statuses
-- .department` is a label (`Bureau Calling`). The mapping lives here, once, in
-- the same place the two vocabularies meet — rather than in each policy that
-- needs to cross between them.
create or replace function public.my_creditops_departments()
returns setof public.fulfillment_department
language sql stable security definer set search_path = public as $function$
  select (case d.key
           when 'onboarding'     then 'Onboarding'
           when 'dispute'        then 'Dispute'
           when 'support'        then 'Support'
           when 'client_success' then 'Support'
           when 'complaints'     then 'Complaints'
           when 'bureau_calling' then 'Bureau Calling'
         end)::public.fulfillment_department
    from public.departments d
   where d.id in (select public.my_departments())
     and d.key in ('onboarding', 'dispute', 'support', 'client_success',
                   'complaints', 'bureau_calling')
$function$;
revoke execute on function public.my_creditops_departments() from public, anon;
grant execute on function public.my_creditops_departments() to authenticated;

comment on function public.my_creditops_departments() is
  'The CreditOps department queues the caller belongs to, named the way the queue rows name them. Derived from live team membership — MY DEPARTMENT, and never "every department in the module" (0344).';

-- ── Reading a queue row needs the department, not just the client ───────
drop policy if exists client_department_statuses_select on public.client_department_statuses;
create policy client_department_statuses_select on public.client_department_statuses
  for select to authenticated
  using (
    /* You must still be able to see the client at all. */
    public.client_department_writable(client_id)
    and (
      /* Running the operation means seeing the work in it. */
      exists (select 1 from public.fulfillment_clients c
               where c.id = client_id and public.is_admin_of(c.agency_id))
      /* The department you are in. */
      or department in (select public.my_creditops_departments())
      /* Work handed to you personally stays visible wherever it sits — the
         same rule `in_scope` applies to every other record. */
      or assignee_id = auth.uid()
      /* A lead sees the work of the team that holds the client. A queue row
         carries no team of its own; the client does. */
      or exists (select 1 from public.fulfillment_clients c
                  where c.id = client_id and c.team_id is not null
                    and public.is_team_lead_of(c.team_id))
    )
  );

comment on policy client_department_statuses_select on public.client_department_statuses is
  'Read a department queue row: you can see the client AND the row is your department''s, yours personally, or your team''s as its lead. Deliberately narrower than the shared directory — seeing a client and working their queue are different permissions (Dee, 2026-09-13).';
