-- The attendance policy stops being constants in a component.
--
-- Dee, 2026-09-18: "Do not hardcode these into frontend components if they are
-- configurable business policy."
--
-- Dee has already changed this policy twice in two days — the perfect-quarter
-- bonus became reliability streaks, and the standing ladder went from five
-- bands to six. Each of those was a deploy. They should have been an edit.
--
-- ── WHAT IS DATA AND WHAT STAYS CODE ──────────────────────────────────────
--
-- DATA: every number. The baseline, the ceiling, what each violation costs,
-- what a perfect month earns, the streak tiers, where each band starts, and
-- the thresholds that raise a coaching or management alert.
--
-- CODE: the CLASSIFICATIONS themselves and the band IDENTITIES. "Half day
-- beats late" is a rule with an order, not a number; a new band would need an
-- icon, a colour and a place in the ladder. Those are a deploy either way, and
-- pretending otherwise would mean a half-configured enum nobody can validate
-- (rule 17: customisation is data — but the ENGINE is not).
--
-- One row per agency, and one call to read it (rule 14).

create table if not exists public.attendance_policy (
  agency_id           uuid primary key references public.agencies(id) on delete cascade,

  /* Where a quarter starts, and the bounds it is clamped to. */
  baseline            numeric(5,2) not null default 15,
  max_points          numeric(5,2) not null default 20,
  min_points          numeric(5,2) not null default 0,

  /* What each violation costs. Stored POSITIVE and negated by the engine, so
     a typo cannot silently turn a penalty into a reward. */
  late_penalty        numeric(5,2) not null default 0.25,
  half_day_penalty    numeric(5,2) not null default 0.50,
  absent_penalty      numeric(5,2) not null default 1.00,
  ncns_penalty        numeric(5,2) not null default 2.00,

  /* Half the scheduled shift or less is a half day. */
  half_day_ratio      numeric(4,3) not null default 0.5
                        constraint attendance_policy_ratio_ck check (half_day_ratio > 0 and half_day_ratio < 1),

  perfect_month_bonus numeric(5,2) not null default 1.00,

  /* Patterns raise a conversation; they never deepen a deduction. */
  lates_for_coaching  integer not null default 3 check (lates_for_coaching > 0),
  late_window_days    integer not null default 30 check (late_window_days > 0),
  ncns_for_management integer not null default 2 check (ncns_for_management > 0),

  /* [{ "days": 30, "points": 0.5, "badge": "30-Day Reliability" }, …] */
  streak_tiers        jsonb not null default
    '[{"days":30,"points":0.5,"badge":"30-Day Reliability"},
      {"days":60,"points":0.5,"badge":"60-Day Reliability"},
      {"days":90,"points":1,"badge":"90-Day Reliability"}]'::jsonb,

  /* Where each band STARTS. The identities are fixed in code; the thresholds
     are Dee's to move. */
  band_champion       numeric(5,2) not null default 20,
  band_excellent      numeric(5,2) not null default 18,
  band_good           numeric(5,2) not null default 15,
  band_coaching       numeric(5,2) not null default 12,
  band_improvement    numeric(5,2) not null default 9,

  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id) on delete set null,

  /* A ladder that is not descending is a ladder with unreachable rungs. */
  constraint attendance_policy_bands_ordered check (
    band_champion > band_excellent
    and band_excellent > band_good
    and band_good > band_coaching
    and band_coaching > band_improvement
    and band_improvement >= min_points
  ),
  constraint attendance_policy_bounds check (max_points > min_points and baseline between min_points and max_points)
);

comment on table public.attendance_policy is
  'Every NUMBER in the BES attendance policy, per agency. The classifications and the band identities stay in code; the values are Dee''s to change without a deploy (Dee, 2026-09-18).';

/* Shape the jsonb, because a malformed tier would silently stop paying. */
create or replace function public.attendance_policy_check_tiers()
returns trigger language plpgsql set search_path = public as $function$
declare t jsonb;
begin
  if jsonb_typeof(new.streak_tiers) <> 'array' then
    raise exception 'Streak tiers must be a list' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(new.streak_tiers) loop
    if jsonb_typeof(t -> 'days') <> 'number'
       or jsonb_typeof(t -> 'points') <> 'number'
       or coalesce(jsonb_typeof(t -> 'badge'), 'null') <> 'string' then
      raise exception 'Each streak tier needs days, points and a badge name'
        using errcode = '22023';
    end if;
    if (t ->> 'days')::numeric <= 0 or (t ->> 'points')::numeric <= 0 then
      raise exception 'A streak tier earns points after a positive number of days'
        using errcode = '22023';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists attendance_policy_valid on public.attendance_policy;
create trigger attendance_policy_valid
  before insert or update on public.attendance_policy
  for each row execute function public.attendance_policy_check_tiers();

-- ── Every agency starts on exactly today's values ─────────────────────────
insert into public.attendance_policy (agency_id)
select a.id from public.agencies a
on conflict (agency_id) do nothing;

/* A new agency gets one too, rather than falling back to whatever the code
   happens to say. */
create or replace function public.seed_attendance_policy()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  insert into public.attendance_policy (agency_id) values (new.id)
  on conflict (agency_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists agencies_seed_attendance_policy on public.agencies;
create trigger agencies_seed_attendance_policy after insert on public.agencies
  for each row execute function public.seed_attendance_policy();

-- ── Who may read it, and who may change it ────────────────────────────────
alter table public.attendance_policy enable row level security;

/* Everybody who works here reads it: the score on their own Attendance page is
   explained by these numbers, and a policy nobody can see is a policy nobody
   can check their own score against. */
create policy attendance_policy_select on public.attendance_policy
  for select to authenticated using (public.is_staff_of(agency_id));

/* Changing it moves everybody's score and the money attached to it, so it
   needs management authority — not merely a team lead, who may correct one
   day for one person but must not reprice a violation for the whole company. */
create policy attendance_policy_update on public.attendance_policy
  for update to authenticated
  using (public.is_manager_of(agency_id))
  with check (public.is_manager_of(agency_id));

revoke all on public.attendance_policy from public, anon;
grant select, update on public.attendance_policy to authenticated;
