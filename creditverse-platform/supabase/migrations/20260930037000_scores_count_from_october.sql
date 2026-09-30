-- Scores count from October 1, 2026. September was the testing phase.
--
-- Dee, 2026-09-30: "Reset all scores for September, no lates violations or
-- deductions. This is testing phase. Now, October is LIVE. No performance
-- impact. Compliance. Attendance."
--
-- Nothing is deleted. Clock records, EOD filings, QA results and the ten
-- September corrections stay as history (rule 11). What changes is the
-- boundary every score engine reads: attendance facts before this day are
-- not attendance events, and a performance period is clamped to start here,
-- so Attendance points, the Compliance and Quality components, coaching
-- alerts and the quarter-close reward sweep all see nothing before it.
--
-- It lives on attendance_policy because that is the one scoring-policy row
-- every score engine — browser hooks and the reward sweep alike — already
-- loads, readable by every staff member (their own score depends on it).
-- Changing it is a company policy change, gated like the rest of the row.
alter table public.attendance_policy
  add column if not exists scoring_starts_on date;

comment on column public.attendance_policy.scoring_starts_on is
  'Attendance, compliance and performance are scored from this day. Days before it were the testing period: no lates, violations, points or scores. Null means from the beginning.';

update public.attendance_policy
   set scoring_starts_on = date '2026-10-01',
       updated_at = now();
