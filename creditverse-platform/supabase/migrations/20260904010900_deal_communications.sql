-- 0131 — what was actually said to a lender about a deal.
--
-- The deal record could show the submission, the stipulations, the offers and
-- the outcome, and could not show the thing a funding team spends most of its
-- day on: the correspondence. "Chased Tuesday, they want the June statement,
-- underwriter is out until Monday" lived in somebody's inbox, so the next
-- person to pick the deal up started from nothing.
--
-- This is NOT a second messaging system (rule 6). Channels are internal
-- conversation between BES and an organization; this is a LOG of contact with
-- a third party — a call that happened, an email that went out. Different
-- participants, different retention, different visibility. Merging them would
-- put a lender's phone call in a staff chat room.
--
-- It records what happened; it does not send anything. Sending an email to a
-- lender goes through the mail provider and is a separate act.

create type public.deal_comm_direction as enum ('outbound', 'inbound');
create type public.deal_comm_channel as enum ('email', 'phone', 'portal', 'meeting', 'note');

create table public.deal_communications (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.funding_deals(id) on delete cascade,
  direction     public.deal_comm_direction not null,
  channel       public.deal_comm_channel not null,
  /** Who at the lender, when it is known. Free text: a name on a call is not a record. */
  counterparty  text,
  /** The lender contact this refers to, when it IS a record. */
  contact_id    uuid references public.lender_contacts(id) on delete set null,
  subject       text,
  body          text not null check (length(trim(body)) > 0),
  /** When it happened, which is not when it was typed up. */
  occurred_at   timestamptz not null default now(),
  recorded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index deal_communications_deal_idx on public.deal_communications (deal_id, occurred_at desc);

alter table public.deal_communications enable row level security;
revoke all on public.deal_communications from anon;
grant select, insert on public.deal_communications to authenticated;

/*
 * Visible to whoever may see the deal's funding file, and to nobody else. The
 * lender is a third party: what was said to them is the organization's record,
 * not the lender's, and a lender user with a share on the file does not get to
 * read the notes about chasing them.
 */
create policy deal_communications_select on public.deal_communications for select to authenticated
  using (exists (
    select 1 from public.funding_deals d
     where d.id = deal_id
       and (public.is_staff_of((select agency_id from public.funding_files f where f.id = d.file_id))
            or exists (select 1 from public.funding_files f join public.funding_clients fc on fc.id = f.client_id
                        where f.id = d.file_id and fc.organization_id is not null
                          and public.is_org_member(fc.organization_id)))
  ));

/*
 * Written only by somebody who may review the file — the same key that moves a
 * stipulation. A log anyone can write is not a record of anything.
 *
 * `recorded_by` must be the caller: a note cannot be filed under somebody
 * else's name.
 */
create policy deal_communications_insert on public.deal_communications for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and exists (select 1 from public.funding_deals d where d.id = deal_id and public.file_reviewer(d.file_id))
  );

/*
 * No update policy and no delete policy. A record of what was said is a record
 * of what was said (rule 11); a correction is another entry, not an edit.
 */

comment on table public.deal_communications is
  'Append-only log of contact with a lender about one deal. Not a messaging system and not a sender — it records that something happened.';
