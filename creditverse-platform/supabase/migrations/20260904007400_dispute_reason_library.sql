-- 0096 — the dispute reason library. Dee's 2024 Metro 2 / factual corpus,
-- as editable rows plus a hardcoded selector.
--
-- Dee, 2026-09-06: "I need the advance logic to be HARD CODED."
--
-- Two halves, and which half is which matters:
--
--   THE SELECTOR IS CODE. Given an item's category, the conditions actually
--   detected in the imported report, the round, and the tier the organization
--   chose, exactly one reason is picked, deterministically, every time. No
--   model chooses it. That is the advanced logic, and it lives in
--   src/lib/dispute/reason-selector.ts under unit test.
--
--   THE WORDING IS DATA. A reason is a sentence. Sentences change when a
--   bureau starts rejecting a phrase, when the law moves, or when Dee finds
--   something that lands better. Rows, editable in the interface, versioned,
--   per-organization overridable — the same shape letter_templates already
--   uses (rule 17: customization is data, not code branches).
--
-- ── The conditions are FACTS, never opinions ────────────────────────────────
-- A reason fires on what the report shows (a balance that differs across
-- bureaus, a charge-off carrying a balance, a payment status of current with a
-- 30-day mark) or on what the consumer has SIGNED (identity theft, breach
-- impact, "I was never late"). An agent's hunch is not a condition, and
-- nothing is ever matched on a name (rule 4).
--
-- ── Why claim_tier exists instead of a banned-word list ─────────────────────
-- The corpus runs from measured to very aggressive, and both ends are
-- legitimate: a consumer may argue forcefully in their own dispute letter.
-- What creates liability for a CREDIT REPAIR ORGANIZATION is narrower
-- (CROA, 15 U.S.C. § 1679b): guaranteeing a result, advising a consumer to
-- state something untrue, or misrepresenting the service.
--
-- A word list cannot tell a real breach victim from someone who is not one.
-- So each reason declares what kind of claim it makes, and the gate reasons
-- about that:
--
--   observed_discrepancy   the report itself shows it        always allowed
--   procedural_demand      "verify this / produce records"   always allowed
--   consumer_asserted_fact a fact about this consumer        needs the signed
--                                                            attestation named
--                                                            in requires_attestation
--   legal_conclusion       "this is a violation"             allowed as the
--                                                            consumer's demand,
--                                                            flagged for review
--
-- A guarantee of outcome is refused at every tier. That one is not a style
-- choice; it is the line CROA draws.

create type public.escalation_tier as enum ('initial', 'firm', 'aggressive');
create type public.claim_tier as enum (
  'observed_discrepancy', 'procedural_demand', 'consumer_asserted_fact', 'legal_conclusion'
);

create table public.dispute_reasons (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  /** Null = a BES default every organization may use. Set = that org's own. */
  organization_id uuid references public.organizations(id) on delete cascade,

  /** Free text rather than an enum: the corpus grows sideways (Child Support,
   *  Medical Collection, Employer) faster than an enum should be migrated. */
  subject       text not null,
  tier          public.escalation_tier not null,
  claim_tier    public.claim_tier not null,

  /** Every condition must hold. Empty = applies whenever the subject matches. */
  requires      text[] not null default '{}',
  /** Signed consumer statements this wording depends on. */
  requires_attestation text[] not null default '{}',
  from_round    integer not null default 1 check (from_round >= 1),
  citations     text[] not null default '{}',
  weight        integer not null default 100,

  body          text not null check (length(trim(body)) > 0),
  label         text not null,
  is_active     boolean not null default true,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index dispute_reasons_lookup_idx
  on public.dispute_reasons (subject, tier, from_round) where is_active;
create index dispute_reasons_org_idx
  on public.dispute_reasons (organization_id) where organization_id is not null;

create trigger dispute_reasons_updated_at before update on public.dispute_reasons
  for each row execute function public.set_updated_at();

comment on table public.dispute_reasons is
  'The wording half of the dispute engine. Which reason fires is decided by hardcoded rules; what it says lives here so it can be edited without a developer.';

alter table public.dispute_reasons enable row level security;

/** Readable: BES defaults by anyone signed in to an organization, plus that
 *  organization's own. Mirrors letter_templates exactly. */
create policy dispute_reasons_select on public.dispute_reasons for select to authenticated
  using (
    organization_id is null
    or public.is_org_member(organization_id)
    or (public.bes_engaged_with(organization_id) and public.is_staff_of(agency_id))
  );

/** Writable: an organization writes its own with the template permission it
 *  already has. BES defaults are BES's, and a customer never edits them —
 *  they copy one and change the copy. */
create policy dispute_reasons_write on public.dispute_reasons for all to authenticated
  using (
    organization_id is not null
    and public.member_can(organization_id, 'creditops.letters.templates')
  )
  with check (
    organization_id is not null
    and public.member_can(organization_id, 'creditops.letters.templates')
  );

revoke all on public.dispute_reasons from anon;
grant select, insert, update, delete on public.dispute_reasons to authenticated;

-- ---------------------------------------------------------------------------
-- The standing enclosure every letter carries (Dee: "Put this to all Letters
-- moving forward"). Kept as its own row so it is edited in one place.
-- ---------------------------------------------------------------------------
create table public.letter_standing_blocks (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  key             text not null,
  label           text not null,
  body            text not null,
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now(),
  unique (agency_id, organization_id, key)
);
create trigger letter_standing_blocks_updated_at before update on public.letter_standing_blocks
  for each row execute function public.set_updated_at();
alter table public.letter_standing_blocks enable row level security;
create policy letter_standing_blocks_select on public.letter_standing_blocks for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id)
         or (public.bes_engaged_with(organization_id) and public.is_staff_of(agency_id)));
create policy letter_standing_blocks_write on public.letter_standing_blocks for all to authenticated
  using (organization_id is not null and public.member_can(organization_id, 'creditops.letters.templates'))
  with check (organization_id is not null and public.member_can(organization_id, 'creditops.letters.templates'));
revoke all on public.letter_standing_blocks from anon;
grant select, insert, update, delete on public.letter_standing_blocks to authenticated;

insert into public.letter_standing_blocks (agency_id, organization_id, key, label, body)
select a.id, null, 'id_verification_purge', 'ID verification — purge notice',
'**FOR VERIFICATION PURPOSES ONLY**
Attached: copy of my personal ID and Social Security card.

Pursuant to 16 CFR § 682.3, please DO NOT retain this information on record. Upon verification of my identity you are to purge the copies of my Driver''s License and Social Security card attached. I DO NOT authorize any sharing of my personal identification.'
from public.agencies a
on conflict do nothing;
