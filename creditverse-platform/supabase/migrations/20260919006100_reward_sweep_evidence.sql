-- Evidence of the decision, and a place for what went wrong.
--
-- Dee, 2026-09-19: "When reward is granted, store enough metadata to explain
-- why: source quarter, final score, policy version/effective rule set,
-- evaluated_at, issued_at, automatic = true. Do not store a second editable
-- attendance score. This metadata is evidence of the decision, not another
-- source of truth."
--
-- So `final_score` is the number the engine produced at the moment of the
-- grant, frozen, and nothing reads it back to compute anything. If a later
-- correction changes the derived score, the row still says what was true when
-- the reward was issued — which is exactly what an auditor wants and exactly
-- what a live column could not promise.

alter table public.reward_credits
  add column if not exists final_score     numeric(5,2),
  add column if not exists policy_snapshot jsonb,
  add column if not exists evaluated_at    timestamptz;

comment on column public.reward_credits.final_score is
  'The engine''s score at the moment of the grant. EVIDENCE, frozen — nothing derives from it, and a later correction does not rewrite it.';
comment on column public.reward_credits.policy_snapshot is
  'The attendance policy in force when this was granted, so the decision can be explained after the policy changes.';

-- ── The grant takes the evidence with it ──────────────────────────────────
drop function if exists public.grant_attendance_reward(uuid, text, text);

create or replace function public.grant_attendance_reward(
  p_user uuid, p_quarter text, p_note text default null,
  p_final_score numeric default null, p_policy jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_agency uuid;
  v_id uuid;
  v_year int;
  v_q int;
  v_quarter_end date;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_automatic boolean := v_me is null;
begin
  if p_quarter !~ '^[0-9]{4}-Q[1-4]$' then
    raise exception 'A quarter reads like 2026-Q3' using errcode = '22023';
  end if;
  v_year := split_part(p_quarter, '-Q', 1)::int;
  v_q    := split_part(p_quarter, '-Q', 2)::int;
  v_quarter_end := (make_date(v_year, v_q * 3, 1) + interval '1 month - 1 day')::date;

  if v_today <= v_quarter_end then
    raise exception '% has not closed yet — it ends on %. A reward is earned at quarter close.',
      p_quarter, to_char(v_quarter_end, 'FMMon FMDD, YYYY') using errcode = '22023';
  end if;

  select m.agency_id into v_agency from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active' limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  if not v_automatic and not public.is_manager_of(v_agency) then
    raise exception 'Issuing a reward needs management access' using errcode = '42501';
  end if;

  insert into public.reward_credits
    (agency_id, user_id, kind, label, source_quarter, issued_automatically,
     issued_on, expires_on, consumed_note, final_score, policy_snapshot, evaluated_at)
  values (v_agency, p_user, 'attendance', p_quarter || ' Attendance Champion',
          p_quarter, v_automatic, v_today, v_today + 90, p_note,
          p_final_score, p_policy, case when v_automatic then now() else null end)
  on conflict (user_id, kind, source_quarter) where source_quarter is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (p_user, v_agency, 'timer', 'reward_credit', v_id::text, 'Time Off',
          'You earned a paid Reward Day',
          p_quarter || ' Attendance Champion. Use it within 90 days — Reward Days do not roll over.',
          'bes_internal');

  return v_id;
end;
$function$;

revoke all on function public.grant_attendance_reward(uuid, text, text, numeric, jsonb) from public, anon;
grant execute on function public.grant_attendance_reward(uuid, text, text, numeric, jsonb) to authenticated;

-- ── One person's bad data must not abort the quarter ──────────────────────
--
-- Dee: "For each failure: write a structured exception… Continue processing
-- the rest."
create table if not exists public.reward_sweep_exceptions (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  quarter     text not null,
  kind        text not null check (kind in (
                'missing_schedule', 'unresolved_attendance', 'invalid_policy',
                'score_failed', 'grant_failed')),
  detail      text not null,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index reward_sweep_exceptions_open_idx
  on public.reward_sweep_exceptions (agency_id, quarter) where resolved_at is null;

alter table public.reward_sweep_exceptions enable row level security;

create policy reward_sweep_exceptions_select on public.reward_sweep_exceptions
  for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (
      public.is_manager_of(agency_id)
      or exists (
        select 1
          from public.team_memberships lead_m
          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
         where lead_m.user_id = auth.uid() and lead_m.is_lead
           and member_m.user_id = reward_sweep_exceptions.user_id
      )
    )
  );

/* Written only by the sweep (service role). Nobody else has a reason to. */
revoke all on public.reward_sweep_exceptions from public, anon;
grant select on public.reward_sweep_exceptions to authenticated;

-- ── The exception feed learns the two new kinds ───────────────────────────
drop function if exists public.reward_exceptions();
create or replace function public.reward_exceptions()
returns table (
  kind text, user_id uuid, person text, detail text, credit_id uuid, severity text
)
language sql stable security definer set search_path to 'public'
as $function$
  select 'missing_birthday', p.id,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         'No birthday on file, so no Birthday Reward can be granted.',
         null::uuid, 'warning'
    from public.profiles p
    join public.agency_memberships m on m.user_id = p.id and m.status = 'active'
   where coalesce(p.is_fixture, false) = false
     and (p.birth_month is null or p.birth_day is null)
     and public.is_manager_of(m.agency_id)

  union all

  select 'birthday_not_granted', p.id,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         'Their birthday month is running and no Birthday Reward has been granted.',
         null::uuid, 'warning'
    from public.profiles p
    join public.agency_memberships m on m.user_id = p.id and m.status = 'active'
   where coalesce(p.is_fixture, false) = false
     and p.birth_month = extract(month from (now() at time zone 'America/New_York'))::int
     and public.is_manager_of(m.agency_id)
     and not exists (
       select 1 from public.reward_credits c
        where c.user_id = p.id and c.kind = 'birthday'
          and extract(year from c.issued_on) = extract(year from (now() at time zone 'America/New_York')))

  union all

  select 'reward_needs_review', c.user_id,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         coalesce(c.review_reason, 'This reward needs management review.'),
         c.id, 'danger'
    from public.reward_credits c
    join public.profiles p on p.id = c.user_id
   where c.needs_review

  union all

  select 'reward_expiring', c.user_id,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         c.label || ' expires ' || to_char(c.expires_on, 'FMMon FMDD') || '.',
         c.id, 'info'
    from public.reward_credits c
    join public.profiles p on p.id = c.user_id
   where c.consumed_at is null
     and c.expires_on >= (now() at time zone 'America/New_York')::date
     and c.expires_on <= (now() at time zone 'America/New_York')::date + 14

  union all

  /* The sweep could not evaluate or could not grant. RLS on the exceptions
     table decides who sees whose. */
  select case when x.kind = 'grant_failed' then 'attendance_reward_grant_failed'
              else 'attendance_reward_evaluation_failed' end,
         x.user_id,
         coalesce(nullif(trim(p.full_name), ''), p.email, 'Quarter ' || x.quarter),
         x.quarter || ': ' || x.detail,
         null::uuid, 'danger'
    from public.reward_sweep_exceptions x
    left join public.profiles p on p.id = x.user_id
   where x.resolved_at is null
$function$;

revoke all on function public.reward_exceptions() from public, anon;
grant execute on function public.reward_exceptions() to authenticated;
