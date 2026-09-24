-- The attachment purge has been failing every hour since 22 September.
--
-- `attachment_purge_dispatch()` calls `extensions.net.http_post(...)`.
-- Postgres reads a three-part name as DATABASE.schema.function, so that asks
-- for a function in a database called "extensions" and the error is
-- "cross-database references are not implemented". pg_net installs into the
-- schema `net`; the call is `net.http_post`, which is how all five of the
-- other dispatchers in this database already write it.
--
--   attendance_reward_dispatch   net.http_post
--   billing_email_dispatch       net.http_post
--   eod_email_dispatch           net.http_post
--   ghl_outbound_dispatch        net.http_post   ← fixed once already, 09-09
--   partner_autopay_dispatch     net.http_post
--   attachment_purge_dispatch    extensions.net.http_post   ← the last one
--
-- ── WHAT ACTUALLY HAPPENED, FROM cron.job_run_details ─────────────────────
--
--   16 succeeded  2026-09-21 22:35 → 2026-09-22 13:35
--   44 failed     2026-09-22 14:35 → 2026-09-24 09:35, every hour
--
-- The early runs "succeeded" because the function returns before the POST
-- when the queue is empty. The first hour something was actually queued, it
-- started failing, and it has failed every hour since. Two items are waiting
-- now and 19 have passed through the queue.
--
-- So this was NOT a job reporting success while doing nothing — cron recorded
-- a hard error 44 times. The silence is that nobody reads
-- `cron.job_run_details`. A scheduled job that fails where only a system
-- table can see it is indistinguishable from one that works, which is the
-- same lesson as 2026-09-09 and the reason the contract probe asks this
-- question of every function rather than of the one that burned us.
--
-- Cost impact: no material increase — it restores a job that was already
-- scheduled. It does mean the purge will now actually run, which is the point:
-- files queued for deletion have not been deleted for two days.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.attachment_purge_dispatch()'::regprocedure);
  v_new text;
begin
  if position('extensions.net.http_post' in v_def) = 0 then
    raise exception 'attachment_purge_dispatch no longer contains the three-part name — read it before replacing it';
  end if;
  v_new := replace(v_def, 'extensions.net.http_post', 'net.http_post');
  execute v_new;
end $$;

/* No function anywhere reaches for pg_net through a database name. Asked of
   the whole schema, so the next dispatcher written by copying an old one
   cannot bring this back. */
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and pg_get_functiondef(p.oid) like '%extensions.net.http_%';
  if v_bad is not null then
    raise exception 'still calling pg_net through a database name: %', v_bad;
  end if;
end $$;

commit;
