-- =============================================================================
-- Correct one over-broad backfill
--
-- Migration 0017 classified existing events in two passes. The second used
--   action like '% status changed'
-- to catch per-department BES workflow rows ("Onboarding status changed"), but
-- it also matched "Deal status changed" and demoted those to bes_internal —
-- after the first pass had correctly marked them shared_with_partner.
--
-- A funded deal is the money event in FundingOps. The partner is entitled to
-- see it, and the trigger already writes it as shared; only the historical rows
-- were wrong.
-- =============================================================================

update public.activity_events
   set visibility = 'shared_with_partner'
 where entity_type = 'funding_client'
   and action = 'Deal status changed'
   and visibility = 'bes_internal';
