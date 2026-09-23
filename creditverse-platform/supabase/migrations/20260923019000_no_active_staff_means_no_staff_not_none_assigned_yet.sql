-- "No active staff" must mean the queue has nobody, not that nothing is
-- assigned yet.
--
-- Caught by looking at the strip with real rows in it. Complaints showed
-- "NO ACTIVE STAFF" because its one file happened to be unassigned — the
-- label fired on "every file here is unowned", which is a different statement.
-- Complaints has three agents. The file was simply waiting for the hourly
-- sweep.
--
-- That is a worse error than a missing label: it tells Dee a staffed
-- department is empty, and the fix she would reach for — staffing it — is the
-- wrong one.
--
-- Whether a queue has anybody is a question about the DEPARTMENT, so it is
-- answered once per department rather than once per file. Five calls, not one
-- per row, which also keeps it cheap when the real client list arrives.
--
-- Cost impact: no material increase — at most one row per CreditOps
-- department, computed on the same screen load as the coverage states.

create or replace function public.creditops_unstaffed_departments()
returns table (department text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  /* A department nobody can be assigned from. The picker is asked WITHOUT a
     partner, because this is about the department's own roster — a partner
     with no named agent still falls back to the team, so partner scope cannot
     make a staffed department unstaffed. */
  select d.dept
    from unnest(enum_range(null::public.fulfillment_department)) d(dept)
   where public.creditops_pick_assignee(
           d.dept,
           (select a.id from public.agencies a order by a.created_at limit 1),
           null
         ) is null
$function$;

revoke execute on function public.creditops_unstaffed_departments() from public, anon;
grant execute on function public.creditops_unstaffed_departments() to authenticated;

comment on function public.creditops_unstaffed_departments() is
  'CreditOps departments with no agent who could be assigned at all. Drives the '
  '"No active staff" label, which must mean the roster is empty rather than '
  'that nothing has been assigned yet (2026-09-23).';
