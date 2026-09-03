-- =============================================================================
-- Make activity_events genuinely append-only
--
-- The timeline was believed to be append-only because there is no DELETE
-- policy. Verified against the live database on 2026-09-03: DELETE is indeed
-- refused, but UPDATE succeeded. `activity_events_update` was written so an
-- author could pin or mark their OWN COMMENT, and RLS policies cannot restrict
-- which columns a statement touches — so that policy also allowed rewriting
-- `action`, `detail`, `previous_value` and `new_value` on SYSTEM-GENERATED
-- audit rows. A signed-in manager could silently change what the record said
-- had happened. Demonstrated by rewriting a real row and putting it back.
--
-- Rule 10 requires that previous value and new value be preserved. An audit
-- trail that the actor can edit is not an audit trail.
--
-- The fix is column-level privileges, because that is the only mechanism in
-- Postgres that limits WHICH COLUMNS an UPDATE may write. RLS still decides
-- WHICH ROWS. Both are needed: the policy says "your own comment", the grant
-- says "only the pin and the mark".
-- =============================================================================

-- Table-wide UPDATE is withdrawn, then handed back for exactly two columns.
revoke update on public.activity_events from authenticated;
grant update (pinned, mark) on public.activity_events to authenticated;

-- Belt and braces: nothing anonymous writes here at all.
revoke insert, update, delete on public.activity_events from anon;

-- Rows remain restricted to the author or a manager; the grant above now caps
-- what they may change to presentation flags only.
drop policy if exists activity_events_update on public.activity_events;

create policy activity_events_update on public.activity_events for update to authenticated
  using (
    -- System-generated rows carry a `field`; a human comment does not. Only
    -- comments are pinnable by their author, and a manager may curate either.
    (actor_id = auth.uid() and field is null)
    or public.is_agency_manager_or_above()
  )
  with check (
    (actor_id = auth.uid() and field is null)
    or public.is_agency_manager_or_above()
  );
