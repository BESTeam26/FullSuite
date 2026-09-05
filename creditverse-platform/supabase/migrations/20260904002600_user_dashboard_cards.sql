-- =============================================================================
-- Home personalization: which cards a person shows on their organization Home,
-- in what order. Per user, per browser-independent (it is account data).
--
-- null = the default layout for whatever the organization is entitled to.
-- A jsonb array of card keys; unknown keys are ignored by the interface, so a
-- card that stops existing can never break a saved layout. Presentation only:
-- a card never grants access to the figures behind it — those queries are
-- RLS-scoped like every other read.
--
-- user_preferences already carries a self-row policy (user_id = auth.uid()) for
-- all commands, so no new policy is needed.
-- =============================================================================
alter table public.user_preferences
  add column if not exists dashboard_cards jsonb;
