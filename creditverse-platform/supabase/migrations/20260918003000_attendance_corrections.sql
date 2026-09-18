-- "That absence was an emergency" — and "that was a no-call, no-show".
--
-- Dee, 2026-09-18, agreeing this is the gap that makes the whole system feel
-- unfair: without it a lead cannot fix a wrong score, and cannot record the
-- one classification the records can never derive.
--
-- ── WHY A CORRECTION IS A ROW, NOT AN EDIT ────────────────────────────────
--
-- Dee's locked rule: "Corrections don't delete history. If a TL later approves
-- an emergency absence, FullSuite reverses the -1 rather than deleting the
-- original event."
--
-- The attendance record itself is DERIVED — `attendance_for` reads the
-- timesheet, the schedule and approved leave. There is nothing to edit, and
-- editing it would be wrong anyway: the timesheet says what it says. So a
-- correction is its own append-only fact placed OVER the derivation, and the
-- score shows both — the original deduction, then the reversal, with who made
-- it and why. Nothing is overwritten and nothing is lost.
--
-- Append-only also means a correction that was itself mistaken is fixed by
-- another correction, not by a delete. The latest one for a day stands.
--
-- ── AND THE ONE CLASSIFICATION THAT CANNOT BE DERIVED ─────────────────────
--
-- NCNS. The records show that somebody did not work; they cannot show whether
-- they phoned in. The engine therefore calls every derived absence "Absent"
-- (−1) and never invents a −2 from silence. Escalating it is a human act, and
-- this table is where that act is recorded.

create table if not exists public.attendance_corrections (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  /** Whose day this is about. */
  user_id       uuid not null references public.profiles(id) on delete cascade,
  work_date     date not null,
  /** What the day should count as. Mirrors the engine's classifications. */
  classification text not null check (classification in
    ('approved_leave', 'on_time', 'late', 'half_day', 'absent', 'ncns')),
  /** Required. A correction with no reason is an unexplained change to pay. */
  reason        text not null check (length(trim(reason)) >= 5),
  decided_by    uuid not null references public.profiles(id) on delete restrict,
  decided_at    timestamptz not null default now(),
  constraint attendance_corrections_not_future
    check (work_date <= (now() at time zone 'utc')::date + 1)
);

create index attendance_corrections_person_idx
  on public.attendance_corrections (user_id, work_date desc, decided_at desc);

comment on table public.attendance_corrections is
  'Append-only corrections laid OVER derived attendance. Never edits the record it corrects: the original deduction and its reversal both stay, with who made it and why (Dee, 2026-09-18). The latest row for a day stands.';

alter table public.attendance_corrections enable row level security;

/* Read: your own, your team's if you lead it, or management's view of all.
   The same shape as `leave_requests_select`, deliberately — two different
   answers to "who may see this person's attendance" is how one of them
   quietly becomes wrong. */
create policy attendance_corrections_select on public.attendance_corrections
  for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (
      user_id = auth.uid()
      or public.is_manager_of(agency_id)
      or exists (
        select 1
          from public.team_memberships lead_m
          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
         where lead_m.user_id = auth.uid() and lead_m.is_lead
           and member_m.user_id = attendance_corrections.user_id
      )
    )
  );

/* No direct writes at all. Correcting somebody's attendance affects pay and a
   quarterly reward, so it goes through the function below, which refuses your
   own and records the actor. A policy that allowed the insert would let the
   `decided_by` be forged. */

revoke all on public.attendance_corrections from public, anon;
grant select on public.attendance_corrections to authenticated;

-- ── Recording one ─────────────────────────────────────────────────────────
create or replace function public.record_attendance_correction(
  p_user uuid, p_date date, p_classification text, p_reason text
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
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_user = v_me then
    /* The same rule as leave and time adjustments: nobody decides their own. */
    raise exception 'You cannot correct your own attendance' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why this is being corrected' using errcode = '22023';
  end if;

  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_user and m.status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'That person is not active staff' using errcode = '42501';
  end if;

  if not (
    public.is_manager_of(v_agency)
    or exists (
      select 1
        from public.team_memberships lead_m
        join public.team_memberships member_m on member_m.team_id = lead_m.team_id
       where lead_m.user_id = v_me and lead_m.is_lead
         and member_m.user_id = p_user
    )
  ) then
    raise exception 'Correcting attendance needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  insert into public.attendance_corrections
    (agency_id, user_id, work_date, classification, reason, decided_by)
  values (v_agency, p_user, p_date, p_classification, trim(p_reason), v_me)
  returning id into v_id;

  /* The person is told. A change to their score that they discover at the end
     of the quarter is a change they cannot question. */
  insert into public.notifications
    (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select p_user, v_agency, 'timer', 'time_entry', v_id::text, 'Attendance',
         'Your attendance for ' || to_char(p_date, 'FMMon FMDD') || ' was corrected',
         'Now recorded as ' || replace(p_classification, '_', ' ')
           || ' by ' || coalesce(nullif(trim(pr.full_name), ''), pr.email)
           || '. "' || trim(p_reason) || '"',
         'bes_internal'
    from public.profiles pr where pr.id = v_me;

  return v_id;
end;
$function$;

comment on function public.record_attendance_correction(uuid, date, text, text) is
  'Lay a correction over a derived attendance day: reverse a deduction, or escalate an absence to NCNS. A lead of their team or management, never your own, always with a reason, and the person is notified.';

revoke all on function public.record_attendance_correction(uuid, date, text, text) from public, anon;
grant execute on function public.record_attendance_correction(uuid, date, text, text) to authenticated;
