-- Ten functions a signed-out caller could reach.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and a later
-- `grant execute ... to authenticated` does not replace it. This is the third
-- time it has bitten this project: migrations 0003/0004 wrote the lesson down,
-- `set_partner_autopay` hit it last week, and two of the functions below are
-- ones I created this morning after writing that comment.
--
-- The list is exactly what the sql-contract probe names as reachable by `anon`
-- or PUBLIC, plus my own two. It is deliberately not "every function with a
-- PUBLIC grant": most of those are btree_gist internals (gbt_*, *_dist,
-- gbtreekey*), which are extension machinery and are meant to be there.
--
-- ── WHAT WAS ACTUALLY EXPOSED ─────────────────────────────────────────────
--
-- Most read `auth.uid()`, which is null for a signed-out caller, so they
-- returned nothing. Three did not, and are the reason this is not cosmetic:
--
--   `eod_team_rollup(p_lead, p_date)` and `eod_org_rollup(p_date)` take their
--     subject as an ARGUMENT — a whole team's or the whole organization's day.
--   `partner_conversation_context(p_group)` takes a partner id.
--   `retry_eod_email(p_eod)` is a WRITE.
--
-- Whether their own bodies would have refused is beside the point: a function
-- a signed-out caller can invoke is one bad `where` clause away from being a
-- leak, and there is no reason for any of them to be callable without a
-- session.

-- ── Mine, from this morning ────────────────────────────────────────────────
revoke all on function public.invoice_collection_method(uuid) from public, anon;
grant execute on function public.invoice_collection_method(uuid) to authenticated;

revoke all on function public.invoice_is_overdue(uuid) from public, anon;
grant execute on function public.invoice_is_overdue(uuid) to authenticated;

-- ── Communication ──────────────────────────────────────────────────────────
revoke all on function public.my_communication_activity(integer) from public, anon;
grant execute on function public.my_communication_activity(integer) to authenticated;

revoke all on function public.my_saved_messages(integer) from public, anon;
grant execute on function public.my_saved_messages(integer) to authenticated;

revoke all on function public.search_communication(text, integer) from public, anon;
grant execute on function public.search_communication(text, integer) to authenticated;

revoke all on function public.partner_conversation_context(uuid) from public, anon;
grant execute on function public.partner_conversation_context(uuid) to authenticated;

-- ── End of Day ─────────────────────────────────────────────────────────────
revoke all on function public.my_eod_email_status(uuid) from public, anon;
grant execute on function public.my_eod_email_status(uuid) to authenticated;

revoke all on function public.retry_eod_email(uuid) from public, anon;
grant execute on function public.retry_eod_email(uuid) to authenticated;

revoke all on function public.eod_org_rollup(date) from public, anon;
grant execute on function public.eod_org_rollup(date) to authenticated;

revoke all on function public.eod_team_rollup(uuid, date) from public, anon;
grant execute on function public.eod_team_rollup(uuid, date) to authenticated;
