-- The sweep that sends queued EOD reports.
--
-- Every five minutes, matching `billing-email-dispatch`. A report submitted at
-- 17:58 reaches its Team Lead within the same coffee, and the interval costs
-- nothing when the queue is empty — `eod_email_dispatch()` returns immediately
-- unless there is a pending row AND the Vault has an endpoint, so an
-- unconfigured install does not error twelve times an hour.

select cron.schedule(
  'eod-email-dispatch',
  '*/5 * * * *',
  $$ select public.eod_email_dispatch() $$
);
