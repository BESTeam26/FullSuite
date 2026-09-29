-- The queue view reads as the caller.
--
-- creditops_department_queue ran with its owner's rights (no
-- security_invoker), so row-level security on client_department_statuses,
-- fulfillment_clients, organizations, outsourcing_groups and profiles did
-- not apply inside it. Anything that scoped it did so from OUTSIDE — the
-- extra join in creditops_queue_counts() — and a direct read of the view
-- through PostgREST had no scope at all: JM Navales, who may see no client,
-- could select 1,447 queue rows with names, emails and phones.
--
-- Found on 2026-09-30 while trimming that "redundant" join. Fixed by making
-- the view read as the caller, which is what every reader assumed it did.
-- Proven in rolled-back transactions for every active account: the counts
-- function returns the identical answer before and after, and a direct read
-- of the view now returns only what the caller's own policies allow.
--
-- Rule 1: authorization in data access, never only in the interface.

begin;
alter view public.creditops_department_queue set (security_invoker = true);
commit;
