-- 0189 — the rounds Dee's board actually reaches.
--
-- `fulfillment_round` stopped at "Round 4+". The live dispute board has files
-- on Round 5, 6, 7 and 13 — a real client can go a long way past four rounds,
-- and "4+" collapses every one of them into a single label that cannot say
-- which round a file is on.
--
-- Purely ADDITIVE. "Round 4+" stays a valid value and nothing that used it
-- changes; the numbered rounds simply become available. Nothing is renamed and
-- nothing is taken away — the last time a vocabulary was replaced rather than
-- extended it was the wrong repair, and this one is deliberately not that.
alter type public.fulfillment_round add value if not exists 'Round 5';
alter type public.fulfillment_round add value if not exists 'Round 6';
alter type public.fulfillment_round add value if not exists 'Round 7';
alter type public.fulfillment_round add value if not exists 'Round 8';
alter type public.fulfillment_round add value if not exists 'Round 9';
alter type public.fulfillment_round add value if not exists 'Round 10';
alter type public.fulfillment_round add value if not exists 'Round 11';
alter type public.fulfillment_round add value if not exists 'Round 12';
alter type public.fulfillment_round add value if not exists 'Round 13';
