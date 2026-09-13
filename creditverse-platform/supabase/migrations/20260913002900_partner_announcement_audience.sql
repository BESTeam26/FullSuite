-- =============================================================================
-- BES can address an announcement to its partners.
--
-- The audience enum was `organization | all_organizations | bes_internal`, so
-- there was no way to publish something partners should see — which is what
-- the portal's Updates page is for: service notices, maintenance windows,
-- compliance changes, the holiday schedule.
--
-- Its own migration because `alter type … add value` cannot be used in the
-- transaction that adds it.
-- =============================================================================

alter type public.announcement_audience add value if not exists 'partners';
