-- Time Off Type → Approval → Compensation. Three layers, not one.
--
-- Dee, 2026-09-19: "The mistake would be equating 'leave type' with 'paid
-- leave balance.' Those should be separate concepts… an agent can request Sick
-- Leave, Paternity Leave, Bereavement Leave, Emergency Leave, Personal Time
-- Off, etc., while the system independently determines whether that specific
-- request is paid, unpaid, or uses an earned reward."
--
-- And the rule that makes it work: "Approved does not automatically mean paid.
-- Approval Status and Compensation Status must be separate."
--
-- So a request now carries BOTH. `status` is whether somebody may be away;
-- `compensation` is whether BES pays for it. An approved sick day is
-- "Approved · Unpaid" and that is not a contradiction — it is the policy.
--
-- ── WHAT KEEPS A BALANCE ──────────────────────────────────────────────────
--
-- Only earned rewards. Bereavement, sickness and the rest are REQUEST
-- CATEGORIES, not banks: "Bereavement Balance: 7 days" is meaningless for a
-- contractor model, and the absence of a bank is exactly why somebody should
-- feel free to report a legitimate absence properly.
--
-- ── A NOTE THAT IS NOT A LEGAL DETERMINATION ──────────────────────────────
--
-- Dee has twice asked for Philippine labour counsel to review the contractor
-- classification before rollout, and is right that an app label cannot settle
-- it: RA 8187 paternity leave and DOLE's statutory leave provisions are framed
-- around EMPLOYEES, and this schema records a voluntary BES contractor policy.
-- `family_birth` is therefore an operational BES category, deliberately not
-- named "statutory paternity leave", and nothing here decides entitlement.

-- ── Default treatment, per type ───────────────────────────────────────────
alter table public.leave_types
  add column if not exists compensation text not null default 'unpaid'
    check (compensation in ('unpaid', 'reward'));

comment on column public.leave_types.compensation is
  'What BES pays for this kind of time off by default: nothing, or an earned reward credit. A TYPE is a request category — never a balance (Dee, 2026-09-19).';

/* Which reward a 'reward' type spends. Null for everything unpaid. */
alter table public.leave_types
  add column if not exists reward_kind text
    check (reward_kind is null or reward_kind in ('birthday', 'attendance'));

-- ── And the treatment of THIS request ─────────────────────────────────────
alter table public.leave_requests
  add column if not exists compensation text not null default 'unpaid'
    check (compensation in ('unpaid', 'reward'));

comment on column public.leave_requests.compensation is
  'Whether BES pays for this particular absence. Deliberately separate from `status`: "Approved · Unpaid" is the normal case, not a contradiction.';

-- ── Dee's list of types ───────────────────────────────────────────────────
--
-- Existing types are DEACTIVATED, never deleted — requests point at them and
-- history must still read (rule 11). `vacation` and `unpaid` go because both
-- implied a bank BES does not run; `maternity` and `paternity` are folded into
-- one operational category.
update public.leave_types set active = false
 where code in ('vacation', 'unpaid', 'maternity', 'paternity');

insert into public.leave_types (agency_id, code, label, paid, sort, min_notice_days, compensation)
select a.id, v.code, v.label, false, v.sort, v.notice, 'unpaid'
  from public.agencies a,
       (values ('personal',     'Personal Time Off',  30, 7),
               ('family_birth', 'Family Birth Leave', 65, 7)) as v(code, label, sort, notice)
on conflict (agency_id, code) do nothing;

update public.leave_types set label = 'Personal Time Off', min_notice_days = 7
 where code = 'personal';

/* The two that ARE paid, and which reward each spends. */
insert into public.leave_types
  (agency_id, code, label, paid, sort, min_notice_days, compensation, reward_kind)
select a.id, v.code, v.label, true, v.sort, v.notice, 'reward', v.reward
  from public.agencies a,
       (values ('birthday_reward',   'Birthday Reward Day',   5,  0, 'birthday'),
               ('attendance_reward', 'Attendance Reward Day', 6,  7, 'attendance'))
         as v(code, label, sort, notice, reward)
on conflict (agency_id, code) do nothing;

/* Everything unpaid says so, whatever it said before. */
update public.leave_types set paid = false, compensation = 'unpaid'
 where compensation = 'unpaid';

-- ── A request inherits its type's treatment, unless it is a reward ────────
create or replace function public.leave_requests_set_compensation()
returns trigger language plpgsql set search_path = public as $function$
declare v_comp text;
begin
  select lt.compensation into v_comp from public.leave_types lt where lt.id = new.type_id;
  /* Set from the TYPE, never from the browser: whether BES pays is policy,
     not something a request may claim for itself. */
  new.compensation := coalesce(v_comp, 'unpaid');
  return new;
end;
$function$;

drop trigger if exists leave_requests_compensation on public.leave_requests;
create trigger leave_requests_compensation
  before insert on public.leave_requests
  for each row execute function public.leave_requests_set_compensation();

/* Everything already filed was unpaid; make that explicit rather than implied. */
update public.leave_requests r set compensation = lt.compensation
  from public.leave_types lt
 where lt.id = r.type_id and r.compensation is distinct from lt.compensation;
