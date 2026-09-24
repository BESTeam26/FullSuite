-- One human may hold several partner-scoped client files, and only BES may
-- know they are connected.
--
-- Dee's ruling, 2026-09-24, locking D-023 (her words):
--
--   "Duplicate detection is scoped within one Partner database only. Do not
--    globally merge client records across different Partners. … If the same
--    person appears under another Partner: create a new client record scoped
--    to that Partner. Do not copy or expose the old Partner's data. Each
--    Partner gets an independent client file. … BES internal users may have a
--    cross-reference such as 'Possible same person across Partners' … That
--    link is internal only. It must never merge the Partner-facing data or
--    broaden tenant visibility. … Same human across Partners does not imply
--    shared tenancy. Person similarity is not authorization."
--
-- ── WHAT DOES NOT CHANGE, WHICH IS MOST OF IT ─────────────────────────────
--
-- `client_match_for_import` already scopes every lookup to one partner and
-- already refuses to merge on a name alone. Under this ruling that is not a
-- gap to close — it is the rule. Nothing about matching changes.
--
-- ── WHAT THIS ADDS ────────────────────────────────────────────────────────
--
-- One table, written by the importer, that records "these two partner files
-- look like the same person". It is a NOTE, not a join: no query anywhere
-- reads through it to reach the other partner's data, and the partner portal
-- cannot see it exists.
--
-- ── WHY THE READ RULE IS "CAN SEE BOTH" ───────────────────────────────────
--
-- A link is a fact about two partners at once. Letting somebody read it
-- because they can see ONE of them would tell a person authorized for Partner
-- A that their client is also a client of Partner B — which is a fact about
-- Partner B's book, leaked through a table that was supposed to protect it.
-- So the policy demands `can_see_partner` on BOTH sides. That composes with
-- the scope model already in place rather than inventing a second gate, and
-- it denies organization and partner-portal users outright, since
-- `can_see_partner` is BES-side only.
--
-- The link never carries WHAT matched — no email, no phone, no date of birth
-- and never an SSN, which by Dee's rule is not decrypted for matching at all.
-- It carries only which field agreed, so a human can judge how strong it is.
--
-- Cost impact: no material increase. At most one row per pair of files that
-- look alike, written once during an import, and nothing reads it on a
-- client's screen.

begin;

create table if not exists public.client_identity_links (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  /* Ordered, so one pair is one row however the import happened to meet it. */
  client_a     uuid not null references public.clients(id) on delete cascade,
  client_b     uuid not null references public.clients(id) on delete cascade,
  group_a      uuid not null references public.outsourcing_groups(id) on delete cascade,
  group_b      uuid not null references public.outsourcing_groups(id) on delete cascade,
  /* email | phone | name_and_dob — which field agreed, never its value. */
  matched_on   text not null check (matched_on in ('email', 'phone', 'name_and_dob')),
  noticed_at   timestamptz not null default now(),
  /* A link nobody can dismiss becomes noise that everybody learns to ignore. */
  resolution   text check (resolution in ('same_person', 'different_people')),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id),
  constraint client_identity_links_ordered check (client_a < client_b),
  constraint client_identity_links_distinct_partners check (group_a <> group_b),
  unique (client_a, client_b)
);

comment on table public.client_identity_links is
  'BES-INTERNAL ONLY. Two partner-scoped client files that look like one '
  'person. A note for BES, never a join: no partner-facing query reads it, '
  'and it never widens what a partner may see (Dee, 2026-09-24, D-023).';

create index if not exists client_identity_links_a_idx on public.client_identity_links (client_a);
create index if not exists client_identity_links_b_idx on public.client_identity_links (client_b);

alter table public.client_identity_links enable row level security;

/* Read only when authorized for BOTH partners. A link is a fact about two
   books at once; seeing one of them is not enough to learn about the other. */
create policy client_identity_links_select on public.client_identity_links
  for select to authenticated
  using (
    public.is_agency_staff()
    and public.can_see_partner(group_a)
    and public.can_see_partner(group_b)
  );

/* Somebody who can read a link may settle it — same person, or two people
   who share a name. There is no INSERT or DELETE policy: links are written
   by the importer through a definer function, and a link is resolved rather
   than deleted so the judgement is not made twice. */
create policy client_identity_links_resolve on public.client_identity_links
  for update to authenticated
  using (
    public.is_agency_staff()
    and public.can_see_partner(group_a)
    and public.can_see_partner(group_b)
  )
  with check (
    public.is_agency_staff()
    and public.can_see_partner(group_a)
    and public.can_see_partner(group_b)
  );

revoke all on public.client_identity_links from anon, public;
grant select, update on public.client_identity_links to authenticated;

/**
 * Notice, without reaching across.
 *
 * Called by the importer once a partner's client row is settled. It looks for
 * clients of OTHER partners in the same agency that look like the same
 * person, and records a note. It returns a COUNT, never a name, an id or a
 * partner — the caller learns that something was noticed, not what.
 *
 * SSN is deliberately absent. Dee: "Do not decrypt SSNs for duplicate
 * matching." The Vault encrypts with a nonce, so two rows holding the same
 * number do not compare equal anyway; the only way to use it would be to
 * decrypt, and that is refused rather than worked around.
 */
create or replace function public.client_note_cross_partner_identity(
  p_client uuid,
  p_group  uuid
) returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agency uuid;
  v_email text; v_phone text; v_name text; v_dob date;
  v_found int := 0;
begin
  select c.agency_id, lower(btrim(c.email::text)),
         nullif(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), ''),
         lower(btrim(c.full_name)), c.date_of_birth
    into v_agency, v_email, v_phone, v_name, v_dob
    from public.clients c where c.id = p_client;
  if v_agency is null then return 0; end if;

  /* Same identifiers the partner-local matcher trusts, and in the same order
     of strength — but here they only ever produce a note. */
  insert into public.client_identity_links
    (agency_id, client_a, client_b, group_a, group_b, matched_on)
  select v_agency,
         least(p_client, o.id), greatest(p_client, o.id),
         case when p_client < o.id then p_group else o.outsourcing_group_id end,
         case when p_client < o.id then o.outsourcing_group_id else p_group end,
         m.matched_on
    from public.clients o
    cross join lateral (
      select case
               when v_email is not null and lower(btrim(o.email::text)) = v_email then 'email'
               when v_phone is not null
                    and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = v_phone then 'phone'
               when v_dob is not null and o.date_of_birth = v_dob
                    and lower(btrim(o.full_name)) = v_name then 'name_and_dob'
             end as matched_on
    ) m
   where o.agency_id = v_agency
     and o.id <> p_client
     and o.outsourcing_group_id is not null
     and o.outsourcing_group_id <> p_group
     and m.matched_on is not null
  on conflict (client_a, client_b) do nothing;

  get diagnostics v_found = row_count;
  return v_found;
end $function$;

revoke execute on function public.client_note_cross_partner_identity(uuid, uuid) from public, anon;
/* Only the importer calls it, and it is SECURITY DEFINER: no ordinary session
   needs the ability to ask "is this person known elsewhere?". */
revoke execute on function public.client_note_cross_partner_identity(uuid, uuid) from authenticated;

comment on function public.client_note_cross_partner_identity(uuid, uuid) is
  'Records that a client of one partner looks like a client of another. '
  'Returns a count only — never a name, an id or a partner. Never merges, '
  'never widens visibility (Dee, 2026-09-24, D-023).';

commit;
