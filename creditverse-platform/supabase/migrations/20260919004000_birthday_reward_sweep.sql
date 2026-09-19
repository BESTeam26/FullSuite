-- Birthday Rewards grant themselves.
--
-- Dee, 2026-09-19: "The system grants it automatically based on their verified
-- birthday." Until now the function existed and nothing called it, which is a
-- reward that only arrives if somebody remembers — the opposite of automatic.
--
-- ── WHY DAILY, AND WHY THAT IS CHEAP ──────────────────────────────────────
--
-- Not monthly. Somebody activated on the 12th of their own birthday month
-- would miss theirs entirely for a year, and a person joining BES is exactly
-- who should not discover a gap in the reward policy. Daily catches them the
-- next morning.
--
-- Running it 365 times a year is safe because the unique index
-- `reward_credits_one_birthday_a_year` is the real guard: the insert is
-- `on conflict do nothing`, so every run after the first in a month grants
-- nothing and touches nothing.
--
-- No Edge Function and no Vault secret, unlike the email sweeps: this is
-- entirely inside the database, so there is nothing to call out to and nothing
-- to authenticate. A dispatcher here would be ceremony around a single insert.

select cron.schedule(
  'birthday-reward-grant',
  /* 02:15 UTC — mid-morning in Manila, late evening in New York. Off the hour
     so it does not contend with every other sweep that chose :00. */
  '15 2 * * *',
  $$ select public.grant_birthday_rewards() $$
);

comment on function public.grant_birthday_rewards(date) is
  'Grants one Birthday Reward to every active non-fixture person whose birthday month it is, valid to the end of that month. Runs daily from cron; idempotent, so it grants nothing on the other 30 days.';
