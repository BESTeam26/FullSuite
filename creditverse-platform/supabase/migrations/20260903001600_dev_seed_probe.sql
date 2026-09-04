-- Smoke test for `dev_seed_user`: one account, so a failed approach costs one
-- row rather than thirty. Sign-in is verified from the app before the full
-- development dataset is written.
select public.dev_seed_user(
  'probe.agent@bes.test', 'DevTest!2026', '[TEST] Probe Agent'
);
