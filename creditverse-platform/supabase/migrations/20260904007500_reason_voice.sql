-- 0097 — register is its own axis.
--
-- Dee's "AGGRESSIVE ATTACK" and "SOME HEAVY ASS WORDS" columns turned out to be
-- neither a tier nor a destination. They are the VOICE: a real person, annoyed,
-- writing about their own credit report. Dee: "that's why there's an emotion
-- here. Sounding frustrated for more human feel."
--
-- It is a separate column from `tier` because the two vary independently — a
-- firm letter can be plain, an aggressive one can still be measured — and
-- because keeping them apart is what makes the compliance rule statable in one
-- line:
--
--   VOICE governs how it SOUNDS. claim_tier governs what may be ASSERTED.
--
-- Being annoyed was never the compliance question. Asserting an unconfirmed
-- fact is, and that is already gated by claim_tier and requires_attestation.

create type public.reason_voice as enum ('plain', 'frustrated');

alter table public.dispute_reasons
  add column if not exists voice public.reason_voice not null default 'plain';

comment on column public.dispute_reasons.voice is
  'Register, independent of tier. "frustrated" is a real person who has written before and is tired of writing; it never licenses a claim the record cannot carry.';

create index if not exists dispute_reasons_voice_idx
  on public.dispute_reasons (subject, tier, voice) where is_active;
