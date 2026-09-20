-- The CreditOps pipeline, matched to the GHL pipeline (Dee, 2026-09-20).
--
-- Dee: "instead of just the regular credit status, we want to match this with
-- our GHL pipeline… Some of these statuses are already locked in the system,
-- follow what we have locked and add these new credit statuses."
--
-- So four of her stages already exist under the names the system locked, and
-- are reused rather than duplicated under a second spelling:
--
--   "New Client Onboarded"   → New Client            (locked)
--   "Incomplete Onboarding"  → Incomplete Onboarding (locked, exact)
--   "Round 1 Ready"          → Ready for Round 1     (locked)
--   "Ready for Processing"   → Ready for Processing  (locked, exact)
--
-- Seventeen are genuinely new: the twelve round-sent stages, three CMS issue
-- levels, the mailed state and the results state.
--
-- This migration only ADDS the values. Postgres will not let a value added in
-- a transaction be used in that same transaction, so the routing that gives
-- each one a department lives in the next migration. Adding without routing
-- is safe in between: `creditops_status_routing` is what places a client in a
-- queue, and an unrouted status simply places nobody.

do $$
declare v text;
begin
  foreach v in array array[
    'Round 1 Sent', 'Round 2 Sent', 'Round 3 Sent', 'Round 4 Sent',
    'Round 5 Sent', 'Round 6 Sent', 'Round 7 Sent', 'Round 8 Sent',
    'Round 9 Sent', 'Round 10 Sent', 'Round 11 Sent', 'Round 12 Sent',
    'CMS Issue 1', 'CMS Issue 2', 'CMS Issue 3',
    'In Dispute Mailed', 'Results Available for Review'
  ] loop
    execute format('alter type public.fulfillment_client_status add value if not exists %L', v);
  end loop;
end $$;
