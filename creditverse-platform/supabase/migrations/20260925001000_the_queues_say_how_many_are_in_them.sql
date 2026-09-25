-- The queues say how many files are in them.
--
-- Dee, 2026-09-25, looking at the CreditOps sidebar: "I don't see the numbers
-- on here."
--
-- A queue name without a number tells an agent nothing about where to start.
-- The client list has counted for a while; the navigation beside it has not.
--
-- ── WHAT IS COUNTED ───────────────────────────────────────────────────────
--
-- Files that are ACTIONABLE: work somebody can do now. Dee's queue doctrine
-- (§23) is explicit that a round in the post and a file awaiting a client are
-- not the same as work — "Round 8 Sent is waiting externally, NOT completed"
-- — and a badge that counts them tells an agent to start on something they
-- cannot touch.
--
-- Read from `creditops_department_queue`, which is the view the queues
-- themselves render, so the badge and the list it opens can never disagree.
-- That view is SECURITY INVOKER, so the number is already this person's:
-- an agent sees their own scope's count, a manager the division's, and
-- neither is told the size of something they cannot open.
--
-- ── WHY AN RPC AND NOT A FETCH ────────────────────────────────────────────
--
-- Five rows over the wire instead of every open file, counted in the browser.
-- With 72 clients the difference is invisible; at ten times the data it is
-- the "do not fetch a tenant dataset to calculate one card" rule (§7, §14),
-- and the sidebar is on every CreditOps screen.
--
-- Cost impact: no material increase — one grouped query against an indexed
-- view, cached for a minute per person.

create or replace function public.creditops_queue_counts()
returns table (department text, actionable int, waiting int)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select q.department::text,
         count(*) filter (where q.actionable)::int,
         count(*) filter (where q.waiting)::int
    from public.creditops_department_queue q
   group by q.department
$function$;

revoke execute on function public.creditops_queue_counts() from public, anon;
grant execute on function public.creditops_queue_counts() to authenticated;

comment on function public.creditops_queue_counts() is
  'Actionable and waiting counts per CreditOps department, from the same view '
  'the queues render, scoped to the caller because that view is invoker '
  '(Dee, 2026-09-25).';
