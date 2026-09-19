-- Closing the reward engine: source, automation, and what happens when a
-- closed quarter is corrected afterwards.
--
-- Dee, 2026-09-19: "Do NOT grant continuously during the quarter. Evaluate at
-- quarter close… If attendance is later corrected after the quarter closes:
-- unused incorrectly granted reward → flag for management review; already
-- consumed reward → preserve history and flag, do not silently delete/rewrite
-- it."
--
-- The last clause is the one with teeth. A reward already spent is a payment
-- that happened; deleting the credit would make the ledger lie about a real
-- event. So nothing is ever removed — a correction that lands in a closed,
-- rewarded quarter raises a REVIEW on the credit and a human decides.

alter table public.reward_credits
  /* "2026-Q3". The label is display text somebody may reword; this is the key
     the uniqueness rule is built on. */
  add column if not exists source_quarter text,
  add column if not exists issued_automatically boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

comment on column public.reward_credits.source_quarter is
  'The quarter an attendance reward was earned in, e.g. "2026-Q3". The uniqueness rule is person + kind + quarter, so a re-run of the sweep can never grant twice.';
comment on column public.reward_credits.needs_review is
  'A closed quarter was corrected after this reward was issued. Never auto-removed: a spent reward is a payment that happened, and deleting it would make the ledger lie.';

/* Backfill from the label the earlier function wrote, so the constraint below
   can be trusted rather than merely added. */
update public.reward_credits
   set source_quarter = split_part(label, ' ', 1)
 where kind = 'attendance' and source_quarter is null
   and label ~ '^[0-9]{4}-Q[1-4] ';

/* Dee's rule as an INDEX, not a check inside one function: person + quarter +
   type. A second writer cannot forget it. */
create unique index if not exists reward_credits_one_per_quarter
  on public.reward_credits (user_id, kind, source_quarter)
  where source_quarter is not null;

-- ── Correcting a closed, rewarded quarter raises a review ─────────────────
create or replace function public.attendance_correction_flags_reward()
returns trigger language plpgsql set search_path = public as $function$
declare
  v_quarter text;
  v_today date;
begin
  v_today := (now() at time zone 'America/New_York')::date;
  v_quarter := extract(year from new.work_date)::text || '-Q'
             || (floor((extract(month from new.work_date)::int - 1) / 3) + 1)::text;

  /* Only a CLOSED quarter. A correction inside the running quarter simply
     changes the score, which has not been paid on yet. */
  if date_trunc('quarter', new.work_date) + interval '3 months' > v_today then
    return new;
  end if;

  update public.reward_credits c
     set needs_review = true,
         review_reason = 'Attendance for ' || to_char(new.work_date, 'FMMon FMDD, YYYY')
           || ' was corrected to ' || replace(new.classification, '_', ' ')
           || ' after ' || v_quarter || ' closed. '
           || case when c.consumed_at is null
                   then 'This reward is unused — confirm it was earned.'
                   else 'This reward has already been used; the history stands. Confirm it was earned.'
              end
   where c.user_id = new.user_id
     and c.kind = 'attendance'
     and c.source_quarter = v_quarter
     and c.needs_review = false;

  return new;
end;
$function$;

drop trigger if exists attendance_corrections_flag_reward on public.attendance_corrections;
create trigger attendance_corrections_flag_reward
  after insert on public.attendance_corrections
  for each row execute function public.attendance_correction_flags_reward();

-- ── Clearing a review is a decision somebody makes ────────────────────────
create or replace function public.resolve_reward_review(p_credit uuid, p_note text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare c public.reward_credits%rowtype;
begin
  select * into c from public.reward_credits where id = p_credit;
  if not found then raise exception 'No such reward' using errcode = '42501'; end if;
  if not public.is_manager_of(c.agency_id) then
    raise exception 'Resolving a reward review needs management access' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Say what was decided' using errcode = '22023';
  end if;

  update public.reward_credits
     set needs_review = false,
         review_reason = coalesce(review_reason, '') || ' — Resolved: ' || trim(p_note),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_credit;
end;
$function$;

revoke all on function public.resolve_reward_review(uuid, text) from public, anon;
grant execute on function public.resolve_reward_review(uuid, text) to authenticated;

-- ── The exceptions a lead should see ──────────────────────────────────────
--
-- Dee asked for these in the Attention Center. That surface is built around
-- WORK ITEMS — its rows carry a stage and hours-remaining — so widening it is
-- its own change. This function is the data, ready for either home, and is
-- read where leads already operate the policy.
create or replace function public.reward_exceptions()
returns table (
  kind text, user_id uuid, person text, detail text, credit_id uuid, severity text
)
language sql stable security definer set search_path to 'public'
as $function$
  /* Nobody can be granted a Birthday Reward without a birthday on file, and a
     guessed date would be worse than none. */
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

  /* A birthday month that has come without a credit — the grant did not run,
     or ran before they were activated. */
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

  /* Use it or lose it — said while there is still time to use it. */
  select 'reward_expiring', c.user_id,
         coalesce(nullif(trim(p.full_name), ''), p.email),
         c.label || ' expires ' || to_char(c.expires_on, 'FMMon FMDD') || '.',
         c.id, 'info'
    from public.reward_credits c
    join public.profiles p on p.id = c.user_id
   where c.consumed_at is null
     and c.expires_on >= (now() at time zone 'America/New_York')::date
     and c.expires_on <= (now() at time zone 'America/New_York')::date + 14
$function$;

comment on function public.reward_exceptions() is
  'The four reward exceptions Dee asked to surface: missing birthday, a birthday month with no grant, a reward needing review after a late correction, and one expiring within 14 days. RLS on reward_credits still decides which rows a caller sees.';

revoke all on function public.reward_exceptions() from public, anon;
grant execute on function public.reward_exceptions() to authenticated;
