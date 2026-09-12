-- =============================================================================
-- The key that stops a second import duplicating a month of content.
--
-- Dee, 2026-09-13: "we use to generate campaign via GPT, manually uploading
-- this info here is chaotic and waste of time."
--
-- A month of content is planned in one go, then edited, then pasted again.
-- Without a stable identity on each row, the second paste creates thirty more
-- tasks beside the thirty that already exist — which is worse than typing them
-- in, because now somebody has to work out which thirty are real.
--
-- `related_ref` already means something else (the record this work is about,
-- in use on 13 rows), so overloading it would make one column answer two
-- questions. This is its own column, and it is deliberately generic: any
-- importer, not just the marketing one, needs somewhere to record "this row
-- came from there".
--
-- UNIQUE PER WORKSPACE, not globally: two partners may both plan a post whose
-- sheet id is `1`, and they are not the same post.
-- =============================================================================

alter table public.work_items
  add column if not exists external_ref text;

comment on column public.work_items.external_ref is
  'Stable identity of the row this work was imported from, unique within its workspace. What makes re-importing an edited spreadsheet an UPDATE rather than thirty duplicates (2026-09-13).';

create unique index if not exists work_items_external_ref_per_workspace
  on public.work_items (workspace_id, external_ref)
  where external_ref is not null and workspace_id is not null;
