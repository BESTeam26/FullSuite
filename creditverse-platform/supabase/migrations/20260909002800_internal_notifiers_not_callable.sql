-- Hardening sweep finding (Dee's audit, 2026-09-09): two SECURITY DEFINER
-- notification writers took a caller-supplied ROW and were executable by
-- users — notify_timer_stopped even by anon (the 0003/0004 lesson again:
-- Postgres grants PUBLIC execute on new functions by default, and nothing
-- revoked these). Anyone could have forged "timer stopped" or mention
-- notifications to any recipient, with attacker-chosen names and times in
-- the text. Both are internal plumbing called only from other DEFINER
-- functions and triggers, which run as the owner and need no grant at all.
revoke execute on function public.notify_timer_stopped(public.time_entries) from public, anon, authenticated;
revoke execute on function public.notify_mentions(public.activity_events) from public, anon, authenticated;
