-- Leave has to be asked for in advance.
--
-- Dee, 2026-09-18: "Add rule, DO NOT Allow Leave Submission 7 days before the
-- leave request date."
--
-- Seven days' notice, enforced when the request is SUBMITTED. Approving,
-- declining and withdrawing are untouched — the rule is about how much warning
-- the team gets, not about what a lead may then do with it.
--
-- ── WHY IT IS A COLUMN AND NOT THE NUMBER 7 ───────────────────────────────
--
-- Some leave cannot be planned. Nobody gives a week's notice of falling ill,
-- of an emergency, or of a death in the family — a flat seven days would mean
-- sick leave could never be filed at all, and the first person who woke up
-- unwell would find the form refusing them. So the notice period is a property
-- of the LEAVE TYPE (rule 17: customisation is data, not code):
--
--   Vacation, Personal, Unpaid, Maternity, Paternity   7 days
--   Sick, Emergency, Bereavement                       0 — file it same day
--
-- Dee can change any of these with an UPDATE; none of it needs a deploy. If
-- seven days really is meant to apply to sickness too, it is one statement.
--
-- ── WHY A TRIGGER AND NOT A CHECK CONSTRAINT ──────────────────────────────
--
-- A CHECK cannot call a non-immutable function, and "seven days from now"
-- needs the clock. It also must not be re-evaluated later: a check is tested
-- again on every UPDATE, so approving a request the following week would
-- suddenly fail its own admission rule. A BEFORE INSERT trigger asks the
-- question exactly once, at the moment it is actually being asked.

alter table public.leave_types
  add column if not exists min_notice_days integer not null default 7
    constraint leave_types_notice_ck check (min_notice_days between 0 and 90);

comment on column public.leave_types.min_notice_days is
  'How many days of warning this kind of leave needs before it can start. 0 for leave nobody can plan — sickness, emergencies, bereavement. Dee, 2026-09-18.';

/* The unplannable ones. Matched on `code`, which is the stable identifier;
   `label` is display text somebody may reword. */
update public.leave_types set min_notice_days = 0
 where code in ('sick', 'emergency', 'bereavement');

create or replace function public.leave_requests_enforce_notice()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_notice integer;
  v_label  text;
  v_today  date;
  v_earliest date;
begin
  select lt.min_notice_days, lt.label into v_notice, v_label
    from public.leave_types lt where lt.id = new.type_id;
  if v_notice is null or v_notice = 0 then
    return new;
  end if;

  /* The agency's own clock, not the server's UTC date — the same column that
     already defines when a BES day ends. A request filed at 9pm in Manila must
     be judged against the date it is in New York, or the rule moves by a day
     depending on who is asking. */
  select (now() at time zone coalesce(a.eod_timezone, 'America/New_York'))::date
    into v_today
    from public.agencies a where a.id = new.agency_id;
  v_today := coalesce(v_today, (now() at time zone 'America/New_York')::date);
  v_earliest := v_today + v_notice;

  if new.starts_on < v_earliest then
    raise exception
      '% needs at least % days'' notice. The earliest you can start is %.',
      coalesce(v_label, 'This leave'), v_notice, to_char(v_earliest, 'FMMon FMDD, YYYY')
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

/* INSERT only. A decision made later must never be blocked by the admission
   rule the request already passed. */
drop trigger if exists leave_requests_min_notice on public.leave_requests;
create trigger leave_requests_min_notice
  before insert on public.leave_requests
  for each row execute function public.leave_requests_enforce_notice();
