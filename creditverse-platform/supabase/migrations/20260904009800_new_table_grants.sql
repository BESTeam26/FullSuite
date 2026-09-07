-- 0120 — the table grants 0116 and 0117 forgot.
--
-- Found by the matrix, and worth writing down because the failure mode is
-- quiet: every new table had RLS enabled and correct policies, and every
-- SECURITY INVOKER writer was refused anyway — with
--
--     42501: permission denied for table organization_subscriptions
--
-- RLS is a filter applied AFTER the table grant. A table with perfect policies
-- and no grant is not "locked down", it is simply broken for everybody, and
-- the negative probes all passed for the wrong reason: 42501 is 42501 whether
-- it came from a policy or from a missing GRANT.
--
-- The grants are deliberately narrow. Nothing gets DELETE, and the payment
-- tables get no INSERT or UPDATE at all — every write to those still goes
-- through a service-role function, which is what makes a charge evidence
-- rather than a claim. What `authenticated` needs is the ability to READ them
-- (RLS then decides whose rows) and, for the two tables a person legitimately
-- writes, to write them.

-- Letter mailings: `begin_letter_mailing` runs as the caller and inserts the
-- queued row, so the caller needs INSERT. No UPDATE — only
-- `complete_letter_mailing` (service role) may change one, because only it has
-- spoken to the provider.
grant select, insert on public.letter_mailings to authenticated;

-- Subscriptions: `choose_subscription_plan` and `cancel_subscription` run as
-- the caller. Both are gated on `is_org_admin` inside the function AND by RLS.
grant select, insert, update on public.organization_subscriptions to authenticated;

-- Payments: READ ONLY from a browser, forever. There is no policy that would
-- allow a write and now there is no grant either — two independent reasons a
-- browser cannot record money changing hands.
grant select on public.payment_methods, public.payment_transactions to authenticated;

revoke all on public.letter_mailings, public.organization_subscriptions,
              public.payment_methods, public.payment_transactions from anon;
