-- CreditOps ⇄ FundingOps hand-off, part 1 (approved 2026-09-04): the funding
-- status that means "in credit readiness with CreditOps". Added alone so the
-- functions in the next migration can reference it (an enum value cannot be
-- used in the transaction that adds it).
alter type public.funding_client_status add value if not exists 'Credit Readiness' before 'Readiness Review';
