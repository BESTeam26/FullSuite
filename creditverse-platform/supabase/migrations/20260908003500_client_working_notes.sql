-- 0212 — Main Description and Next Action stop pretending.
--
-- ---------------------------------------------------------------------------
-- WHAT THE SCREEN WAS DOING
--
-- Two editable fields on the client workspace, with a note underneath saying:
--
--   "Not saved yet — this panel has no database column, so what is typed
--    here is lost on reload."
--
-- The note was honest. The control was not: it looked exactly like every
-- other field on the page, took a paragraph of somebody's work, and threw it
-- away. Dee, §29: "No pilot UI should invite input and then intentionally
-- discard it."
--
-- Two ways out — make them read-only, or make them real. They are real
-- operational fields (what is going on with this file; what happens next), so
-- they get columns. Neither is a duplicate of anything: `fulfillment_clients`
-- has no free-text field at all today, and the activity timeline is a log of
-- events rather than a place to keep a standing description.
--
-- ---------------------------------------------------------------------------
-- NO NEW AUTHORIZATION SURFACE
--
-- Two nullable text columns on a table whose policies already decide who may
-- read and write a client. `fulfillment_clients_update` governs them exactly
-- as it governs `status`, and the existing activity trigger logs the change,
-- so the timeline says the description moved only when it actually did.
-- ---------------------------------------------------------------------------

alter table public.fulfillment_clients
  add column if not exists description text check (description is null or length(description) <= 20000),
  add column if not exists next_action text check (next_action is null or length(next_action) <= 500);

comment on column public.fulfillment_clients.description is
  'The standing working description of this file — what is going on, in the operator''s own words. Distinct from the activity timeline, which logs events rather than holding a description (0212).';
comment on column public.fulfillment_clients.next_action is
  'What needs to happen next on this file, in one line. A working note, not a task: real work belongs in `work_items`.';
