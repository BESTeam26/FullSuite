-- =============================================================================
-- A partner relationship can END two different ways.
--
-- Dee, 2026-09-12: "Add Completed and Cancelled to the partner lifecycle."
--
-- `archived` was the only ending, and it says nothing about WHY. A partner
-- whose build BES finished and a partner who walked away in month two both
-- read as "archived", and the difference is the one a person actually wants
-- when they open the record a year later.
--
--   completed  BES delivered what was agreed and the relationship closed well
--   cancelled  it ended early, by either side
--   archived   filed away — the shelf, not an outcome
--
-- Added, never re-pointed: nothing existing is migrated, because no row
-- currently claims to be either of these and guessing which archived partner
-- was really "completed" would be inventing history (rule 10).
-- =============================================================================

alter type public.partner_lifecycle add value if not exists 'completed' after 'suspended';
alter type public.partner_lifecycle add value if not exists 'cancelled' after 'completed';
