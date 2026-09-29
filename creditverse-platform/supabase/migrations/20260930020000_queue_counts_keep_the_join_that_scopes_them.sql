-- Queue counts keep the join that scopes them.
--
-- 20260930019000 dropped the second join to fulfillment_clients from
-- creditops_queue_counts() as "a redundant policy pass". It was the ONLY
-- policy pass: the view runs with its owner's rights, so the client policy
-- is applied by that join and nowhere else. Measured after the change,
-- thirteen accounts saw counts they had never seen — JM Navales, who sees
-- no client, saw every queue. Reverted here, minutes later, to the exact
-- prior shape; the view keeps its harmless is_fixture column.
--
-- The lesson is recorded on the function: the join is authorization.

begin;

create or replace function public.creditops_queue_counts()
returns table(department text, actionable integer, waiting integer)
language sql
stable
set search_path to 'public'
as $$
  /* The join to fulfillment_clients is AUTHORIZATION, not decoration: the
     queue view runs as its owner, and this join is where the caller's own
     client policy is applied. Removing it widened the counts to everyone
     (2026-09-30). Never "simplify" it away. */
  select q.department::text,
         count(*) filter (where q.actionable)::int,
         count(*) filter (where q.waiting)::int
    from public.creditops_department_queue q
    join public.fulfillment_clients fc on fc.id = q.client_id
   where not coalesce(fc.is_fixture, false)
   group by q.department
$$;

commit;
