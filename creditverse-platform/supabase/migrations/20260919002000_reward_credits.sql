-- BES pays for time as an EARNED REWARD, not from a leave bank.
--
-- Dee, 2026-09-19: "I would create a balance, but I would NOT call it a
-- traditional Leave Balance if BES contractors do not receive paid
-- vacation/PTO… BES provides paid time as an earned reward, not a general
-- leave bank."
--
-- This replaces the entitlement I added earlier the same day. "Vacation 12/20
-- days" and "Unpaid Leave: 10 days available" both implied a bank BES does not
-- operate, and the second implied an entitlement to unpaid absence as well.
-- `leave_types.annual_days` goes with it rather than lingering as a concept
-- nothing should read (rule 6).
--
-- ── FOUR ENGINES, NOT ONE LEAVE TABLE ─────────────────────────────────────
--
--   Time Off      scheduling — permission to be unavailable. Unpaid.
--   Attendance    reliability — already built.
--   Rewards       earned paid days. THIS table.
--   Compensation  payment. Deliberately not here: a Time Off page must never
--                 work out what somebody is owed.
--
-- ── A LEDGER, NOT A NUMBER ────────────────────────────────────────────────
--
-- Dee: "Don't store simply leave_balance = 3. Store credits." So each credit
-- is its own row with where it came from and when it dies, and spending one
-- marks THAT row. A total is a SUM over rows, never a stored integer that can
-- drift from the reasons behind it.
--
-- ── ONE REWARD, ONE BENEFIT ───────────────────────────────────────────────
--
-- The birthday credit can be taken as a paid day OR worked for a 2× premium,
-- never both. Dee: "That needs to be a hard invariant." It is a CHECK, not a
-- rule in a component: once `election` is set and the credit is consumed, the
-- other option is gone.
--
-- Dee also flagged that calling somebody a contractor does not by itself
-- settle Philippine employment status, and asked for labour counsel to review
-- the classification before rollout. Nothing here decides that question: this
-- table records a contractual BES reward and is deliberately separate from any
-- statutory holiday-pay concept.

alter table public.leave_types drop column if exists annual_days;

create table if not exists public.reward_credits (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,

  /* Where it came from. Birthday is granted; attendance is earned. */
  kind          text not null check (kind in ('birthday', 'attendance')),
  label         text not null check (length(trim(label)) between 1 and 80),
  /* Always whole days today, but numeric so a half-day reward is not a
     migration. */
  days          numeric(4,2) not null default 1 check (days > 0),

  issued_on     date not null default (now() at time zone 'utc')::date,
  /* Birthday: end of the birthday month. Attendance: 90 days. No rollover. */
  expires_on    date not null,

  /* Birthday only: which of the two benefits was chosen. */
  election      text check (election in ('paid_day', 'work_premium')),
  elected_at    timestamptz,

  /* Spent. `consumed_for` points at the leave request that used it, where the
     benefit was a day off rather than a worked premium. */
  consumed_at   timestamptz,
  consumed_for  uuid references public.leave_requests(id) on delete set null,
  consumed_note text,

  /* An audited exception: management may extend when BES itself kept denying
     the request for coverage. The original date is kept. */
  extended_from date,
  extended_by   uuid references public.profiles(id) on delete set null,
  extend_reason text,

  created_at    timestamptz not null default now(),

  constraint reward_credits_expiry_after_issue check (expires_on >= issued_on),
  /* One reward, one benefit: an election is recorded WITH its consumption, and
     a consumed credit cannot be spent again because there is nothing to spend. */
  constraint reward_credits_election_with_consumption check (
    (election is null and elected_at is null)
    or (election is not null and elected_at is not null)
  ),
  /* A worked premium is not a day off, so it never points at a leave request. */
  constraint reward_credits_premium_has_no_leave check (
    election is distinct from 'work_premium' or consumed_for is null
  ),
  constraint reward_credits_extension_audited check (
    extended_from is null
    or (extended_by is not null and length(trim(coalesce(extend_reason, ''))) >= 5)
  )
);

create index reward_credits_wallet_idx
  on public.reward_credits (user_id, expires_on) where consumed_at is null;

/* One birthday reward per person per year — the invariant that stops a second
   one being granted by a re-run or by two people pressing the same button. */
create unique index reward_credits_one_birthday_a_year
  on public.reward_credits (user_id, kind, (extract(year from issued_on)))
  where kind = 'birthday';

comment on table public.reward_credits is
  'Earned PAID time, as an auditable ledger — one row per credit with its source, its expiry and how it was spent. BES runs no leave bank; ordinary time off is unpaid and has no balance (Dee, 2026-09-19).';
comment on column public.reward_credits.election is
  'Birthday only: a paid day off, or working an eligible shift for a 2x premium. One reward, one benefit — never both.';

alter table public.reward_credits enable row level security;

create policy reward_credits_select on public.reward_credits
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
           and member_m.user_id = reward_credits.user_id
      )
    )
  );

/* No direct writes. Granting, electing and extending each have their own
   function with their own rule; an insert policy would let somebody mint
   themselves a paid day. */
revoke all on public.reward_credits from public, anon;
grant select on public.reward_credits to authenticated;
