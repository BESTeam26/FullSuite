-- 0081 — Reading a scanned credit report as its own AI feature
--
-- Dee approved the assistant as the reader for scans and photos (2026-09-05).
-- It gets its own feature key rather than sharing `credit.analysis`, so the
-- cost of reading documents is visible on its own line in AI usage — reading a
-- 30-page scan is a different expense from rephrasing a letter, and an owner
-- should be able to see which is which.
insert into public.ai_features (key, label, product, min_plan, sort) values
  ('credit.report_read', 'Reading scanned reports', 'creditOps', null, 12)
on conflict (key) do update set label = excluded.label, product = excluded.product, sort = excluded.sort;
