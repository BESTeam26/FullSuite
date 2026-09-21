-- The last workforce date still decided in UTC.
--
-- `set_work_schedule` defaulted `p_effective_from` to
-- `(now() at time zone 'utc')::date`. After 8pm Eastern that is tomorrow, so
-- a schedule set in the evening would not take effect until the day after the
-- admin believed. Every other workforce date is Eastern now
-- (20260921014000); this is the one that was left.
--
-- Generated from the live definition: only the default changes.
DO $migration$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_work_schedule';
  IF v_def IS NULL THEN RAISE EXCEPTION 'set_work_schedule is missing'; END IF;
  IF position('((now() AT TIME ZONE ''utc''::text))::date' in v_def) = 0 THEN
    RAISE EXCEPTION 'the UTC default is not where it was — look before replacing';
  END IF;
  EXECUTE replace(v_def,
    '((now() AT TIME ZONE ''utc''::text))::date',
    '((now() AT TIME ZONE ''America/New_York''::text))::date');
END $migration$;
