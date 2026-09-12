-- =============================================================================
-- Sales & Marketing becomes a first-class FullSuite module.
--
-- Dee, 2026-09-12. It sits beside CreditOps, FundingOps, BES CRM and
-- TalentOps inside the same shell — not a separate app, not a separate task
-- engine, and not a second Partner record.
--
-- The enum value lands alone, because Postgres refuses to USE a new enum
-- value in the same transaction that adds it. Everything that reads it
-- follows in the next migration.
-- =============================================================================

alter type public.fulfillment_service add value if not exists 'sales_marketing' after 'talentops';
