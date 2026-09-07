-- 0161 — quarterly and annual, so the normalisation table is complete.
--
-- The engine documents rate × period / 12 for every recurring frequency. Two
-- of them had no catalogue row, which would have forced anyone with an annual
-- contract to record it as CUSTOM — and CUSTOM is excluded from MRR, so a real
-- recurring agreement would have vanished from the run-rate.
insert into public.partner_billing_models (code, label, unit, recurring, sort) values
  ('RECURRING_QUARTERLY', 'Quarterly', 'quarter', true, 32),
  ('RECURRING_ANNUAL',    'Annual',    'year',    true, 34)
on conflict (code) do nothing;
