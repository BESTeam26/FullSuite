-- Performance weighting, as policy data.
--
-- Dee, 2026-09-19, locking the company-level model: "35% Quality + 35% Output
-- + 20% Compliance + 10% Reliability… Quality and Compliance need minimum
-- thresholds regardless of the overall score." Dee's standing rule: business
-- policy is data, never a constant in a component (2026-09-18).
--
-- One row per agency. The weights must total 100. The two thresholds are
-- NULL until Dee states them: a threshold nobody chose must not cap anyone.
-- Read by every staff member (the score is shown to the person it is about);
-- written only with agency-scope management (may_set_agency_policy), the
-- same gate the attendance policy uses.

create table public.performance_policy (
  agency_id         uuid primary key references public.agencies(id) on delete cascade,
  weight_attendance integer not null default 10 check (weight_attendance between 0 and 100),
  weight_quality    integer not null default 35 check (weight_quality between 0 and 100),
  weight_compliance integer not null default 20 check (weight_compliance between 0 and 100),
  weight_output     integer not null default 35 check (weight_output between 0 and 100),
  /** Below either minimum, the overall is capped in the Needs Support band
      however high the rest is. NULL = no threshold set yet. */
  min_quality       integer check (min_quality between 0 and 100),
  min_compliance    integer check (min_compliance between 0 and 100),
  updated_by        uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint performance_policy_weights_total
    check (weight_attendance + weight_quality + weight_compliance + weight_output = 100)
);
comment on table public.performance_policy is
  'Company-level performance weighting (Dee, 2026-09-19): Quality 35, Output 35, Compliance 20, Attendance 10, plus minimum thresholds for Quality and Compliance. Policy is data; the derivation is lib/people/performance-metrics.ts.';

alter table public.performance_policy enable row level security;
create policy performance_policy_select on public.performance_policy
  for select to authenticated using (public.is_staff_of(agency_id));
create policy performance_policy_update on public.performance_policy
  for update to authenticated
  using (public.may_set_agency_policy(agency_id))
  with check (public.may_set_agency_policy(agency_id));
grant select, update on public.performance_policy to authenticated;

insert into public.performance_policy (agency_id)
select id from public.agencies
on conflict (agency_id) do nothing;
