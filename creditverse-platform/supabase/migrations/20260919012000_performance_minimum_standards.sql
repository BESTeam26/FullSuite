-- Minimum standards for Quality and Compliance — Dee, 2026-09-19 (decision #6):
-- "Quality minimum = 85% · Compliance minimum = 90%. These are minimum-standard
-- flags, not mathematical caps." Policy data on the existing row; the engine
-- (lib/people/performance-metrics.ts) reports them as flags beside an
-- unchanged overall.
update public.performance_policy
   set min_quality = 85, min_compliance = 90, updated_at = now()
 where min_quality is null and min_compliance is null;

comment on column public.performance_policy.min_quality is
  'Minimum standard for the Quality component, whole percent. A FLAG (Below Standard), never a cap on the overall — Dee, 2026-09-19.';
comment on column public.performance_policy.min_compliance is
  'Minimum standard for the Compliance component, whole percent. A FLAG (Below Standard), never a cap on the overall — Dee, 2026-09-19.';
