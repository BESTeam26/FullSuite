-- 0102 — DIY Credit. A consumer journey over the engines that already exist.
--
-- Dee: "Build DIY as a consumer product journey on top of the canonical Client
-- identity and C3 Client Portal. Do not create a parallel consumer
-- architecture." And: "A DIY customer who later upgrades to managed CreditOps
-- must not be re-created, re-imported, or lose their report history."
--
-- So there is no consumer table, no consumer login, no consumer report and no
-- consumer document model here. A DIY customer is a `clients` row with a
-- portal login — the same row a managed client has. What DIY adds is a
-- JOURNEY: where this person has got to in doing the work themselves.
--
-- ── Whose customer is a DIY consumer? ──────────────────────────────────────
--
-- The organization whose DIY product they enrolled through. DIY is
-- white-labelable, and rule 16 says an organization serves its own customers,
-- so a consumer who signs up through Lakeside's DIY offering is Lakeside's
-- client. BES's own DIY consumers are clients of the BES-owned organization.
-- That keeps one tenancy rule for everybody and means the upgrade below is a
-- row, not a migration of a person between systems.
--
-- ── The upgrade, which is the whole point ──────────────────────────────────
--
-- DIY today, managed CreditOps in three months. What happens: a
-- `fulfillment_clients` row is created pointing at the SAME client. That is
-- all. Their reports, documents, activity, portal login and dispute history
-- are already on the canonical client, so nothing is re-imported and nothing
-- is lost. The one thing that had to change for this to be true is below.

-- ---------------------------------------------------------------------------
-- 1. Reports follow the CLIENT, not the engine record.
--
-- `credit_reports` keyed a DIY report by `consumer_user_id` and a managed one
-- by `fulfillment_client_id`. On upgrade the DIY history would have been
-- invisible to the managed case — exactly the loss Dee ruled out. A canonical
-- `client_id` makes the report the person's, so upgrading re-points nothing.
-- ---------------------------------------------------------------------------
alter table public.credit_reports
  add column if not exists client_id uuid references public.clients(id) on delete cascade;
create index if not exists credit_reports_client_idx on public.credit_reports (client_id);

update public.credit_reports r
   set client_id = fc.client_id
  from public.fulfillment_clients fc
 where r.fulfillment_client_id = fc.id and r.client_id is null;

update public.credit_reports r
   set client_id = c.id
  from public.clients c
 where r.consumer_user_id = c.portal_user_id and r.client_id is null;

/** Fill it on the way in, so no writer has to know about clients. */
create or replace function public.credit_report_set_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null then return new; end if;
  if new.fulfillment_client_id is not null then
    select client_id into new.client_id from public.fulfillment_clients where id = new.fulfillment_client_id;
  elsif new.consumer_user_id is not null then
    select id into new.client_id from public.clients where portal_user_id = new.consumer_user_id limit 1;
  end if;
  return new;
end $$;
revoke all on function public.credit_report_set_client() from public, anon, authenticated;
create trigger credit_reports_set_client before insert on public.credit_reports
  for each row execute function public.credit_report_set_client();

/* The canonical client is now a way in, alongside the two that existed. */
create or replace function public.credit_report_visible(p_client uuid, p_consumer uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_client is not null then public.entity_visible('fulfillment_client', p_client::text)
    when p_consumer is not null then
      p_consumer = auth.uid()
      or (public.is_org_member(p_org) and public.org_entitled(p_org, 'diyCredit'))
      or (public.bes_engaged_with(p_org))
    else false
  end
$$;

drop policy if exists credit_reports_select on public.credit_reports;
create policy credit_reports_select on public.credit_reports for select to authenticated
  using (
    public.credit_report_visible(fulfillment_client_id, consumer_user_id, organization_id)
    /* …or it belongs to a client the caller may see, which covers the DIY
       consumer reading their own and the organization reading it after an
       upgrade, with no re-pointing. */
    or (client_id is not null and public.client_visible(client_id))
  );

comment on column public.credit_reports.client_id is
  'The canonical person this report is about. Set on insert. Makes a DIY report survive an upgrade to managed CreditOps without being re-imported.';

-- ---------------------------------------------------------------------------
-- 2. Provenance: a self-enrolled consumer is distinguishable from a record an
--    agent created, which matters for reporting and for support.
-- ---------------------------------------------------------------------------
alter type public.client_provenance add value if not exists 'diy_self_serve';

-- ---------------------------------------------------------------------------
-- 3. Consent. Recorded before any dispute work, and never inferred.
--
-- Kept separate from the journey because a consent is a dated, immutable fact
-- about what a person agreed to, and a journey stage is a moving position. One
-- gets superseded; the other never changes.
-- ---------------------------------------------------------------------------
create table public.diy_consents (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  kind           text not null check (kind in ('service_terms', 'self_help_acknowledgement', 'report_access')),
  /** What they actually agreed to, kept verbatim so it can be produced later. */
  statement      text not null,
  version        text not null,
  agreed_at      timestamptz not null default now(),
  agreed_ip      inet,
  /** Withdrawn rather than deleted: the fact that consent existed is history. */
  withdrawn_at   timestamptz
);
create index diy_consents_client_idx on public.diy_consents (client_id);
alter table public.diy_consents enable row level security;
create policy diy_consents_select on public.diy_consents for select to authenticated
  using (public.client_visible(client_id));
revoke all on public.diy_consents from anon;
grant select on public.diy_consents to authenticated;

comment on table public.diy_consents is
  'Append-only record of what a DIY consumer agreed to and when. No update or delete policy: a consent is withdrawn by setting withdrawn_at through a function, never erased.';

-- ---------------------------------------------------------------------------
-- 4. The journey. One row per client, and it is a POSITION, not a person.
-- ---------------------------------------------------------------------------
create type public.diy_stage as enum (
  'enrolled', 'consented', 'report_added', 'data_reviewed', 'facts_confirmed',
  'issues_identified', 'attested', 'plan_built', 'drafts_reviewed', 'approved',
  'sent', 'awaiting_response', 'response_recorded', 'reimported', 'compared'
);

create table public.diy_journeys (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  stage            public.diy_stage not null default 'enrolled',
  round_number     integer not null default 1 check (round_number >= 1),
  /**
   * Identity theft is a SEPARATE, GATED pathway and is never inferred from
   * report data (Dee, explicit). This flag is set only by a consumer who has
   * said so and produced an Identity Theft Report; nothing in the engine turns
   * it on because an account looked unfamiliar.
   */
  identity_theft_pathway boolean not null default false,
  identity_theft_report_at timestamptz,
  started_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  stage_changed_at timestamptz not null default now()
);
create trigger diy_journeys_updated_at before update on public.diy_journeys
  for each row execute function public.set_updated_at();

alter table public.diy_journeys enable row level security;
create policy diy_journeys_select on public.diy_journeys for select to authenticated
  using (public.client_visible(client_id));
revoke all on public.diy_journeys from anon;
grant select on public.diy_journeys to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Enrolling. The one write a consumer makes that creates a record.
--
-- A SECURITY DEFINER function rather than an INSERT policy, because a general
-- insert policy on `clients` would let a signed-in stranger create a client in
-- any organization. Here the organization must actually sell DIY, the person
-- becomes the portal user for their own row and nobody else's, and the unique
-- index on (partner, email) means enrolling twice finds the existing record
-- rather than making a second person.
-- ---------------------------------------------------------------------------
create or replace function public.diy_enroll(
  p_org uuid, p_first_name text, p_last_name text, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email citext;
  v_agency uuid;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_org is null then
    raise exception 'An organization is required' using errcode = '22023';
  end if;
  /* The organization must actually sell this. A consumer cannot enrol into a
     product the organization did not buy (rule 18, layer one). */
  if not public.org_entitled(p_org, 'diyCredit') then
    raise exception 'This organization does not offer DIY Credit' using errcode = '42501';
  end if;
  if coalesce(trim(p_last_name), '') = '' then
    raise exception 'A surname is required' using errcode = '22023';
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  select agency_id into v_agency from public.organizations where id = p_org;

  /* Already a client of this organization? Then this is the same person
     enrolling in DIY, not a new one. Take the existing record. */
  select id into v_client from public.clients
   where partner_scope_id = p_org and lower(email::text) = lower(v_email::text);

  if v_client is null then
    insert into public.clients
      (agency_id, organization_id, mode, first_name, last_name, email, phone,
       portal_user_id, status, provenance, created_by)
    values (v_agency, p_org, 'saas_pulled', nullif(trim(p_first_name), ''), trim(p_last_name),
            v_email, nullif(trim(p_phone), ''), auth.uid(), 'active', 'diy_self_serve', auth.uid())
    returning id into v_client;
  else
    /* Claim the portal login if nobody holds it. Never steal one that is set:
       that would hand this person somebody else's file. */
    update public.clients set portal_user_id = auth.uid()
     where id = v_client and portal_user_id is null;
    if not exists (select 1 from public.clients where id = v_client and portal_user_id = auth.uid()) then
      raise exception 'This client record is already linked to a different sign-in' using errcode = '42501';
    end if;
  end if;

  insert into public.diy_journeys (client_id) values (v_client)
  on conflict (client_id) do nothing;

  perform public.log_audit('diy.enrolled', 'client', v_client::text, p_org, null,
                           jsonb_build_object('provenance', 'diy_self_serve'));
  return v_client;
end $$;
revoke all on function public.diy_enroll(uuid, text, text, text) from public, anon;
grant execute on function public.diy_enroll(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Recording a consent, and moving the journey.
-- ---------------------------------------------------------------------------
create or replace function public.diy_record_consent(
  p_client uuid, p_kind text, p_statement text, p_version text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_client_of(p_client) then
    raise exception 'Only the person themself gives consent' using errcode = '42501';
  end if;
  insert into public.diy_consents (client_id, kind, statement, version)
  values (p_client, p_kind, p_statement, p_version)
  returning id into v_id;
  perform public.log_audit('diy.consent_recorded', 'client', p_client::text,
                           (select organization_id from public.clients where id = p_client),
                           null, jsonb_build_object('kind', p_kind, 'version', p_version));
  return v_id;
end $$;
revoke all on function public.diy_record_consent(uuid, text, text, text) from public, anon;
grant execute on function public.diy_record_consent(uuid, text, text, text) to authenticated;

/**
 * Move the journey on.
 *
 * The ORDER is enforced in TypeScript, where it is testable without a database
 * and shared with the interface. What the database enforces is the part that
 * must not be bypassable from a console: only the person themself moves their
 * own journey, and two stages have hard gates.
 */
create or replace function public.diy_advance(p_client uuid, p_stage public.diy_stage)
returns void
language plpgsql security definer set search_path = public as $$
declare j public.diy_journeys;
begin
  if not public.is_client_of(p_client) then
    raise exception 'Only the person themself moves their own journey' using errcode = '42501';
  end if;
  select * into j from public.diy_journeys where client_id = p_client;
  if j.client_id is null then
    raise exception 'Not enrolled in DIY' using errcode = 'P0002';
  end if;

  /* Gate one: nothing happens before consent is on record. */
  if p_stage <> 'consented' and j.stage = 'enrolled' then
    raise exception 'Consent has to be recorded first' using errcode = '42501';
  end if;
  if p_stage = 'consented' and not exists (
    select 1 from public.diy_consents
     where client_id = p_client and kind = 'service_terms' and withdrawn_at is null
  ) then
    raise exception 'No consent on record' using errcode = '42501';
  end if;

  /* Gate two: a letter is not approved before the facts under it are attested.
     This is the truth gate, and it is the reason a DIY letter can be signed by
     the consumer at all — they have said the facts are true, in writing. */
  if p_stage in ('approved', 'sent') and j.stage not in ('attested', 'plan_built', 'drafts_reviewed', 'approved') then
    raise exception 'The facts have to be confirmed before a letter is approved' using errcode = '42501';
  end if;

  update public.diy_journeys
     set stage = p_stage,
         stage_changed_at = now(),
         round_number = case when p_stage = 'reimported' then round_number + 1 else round_number end
   where client_id = p_client;

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, visibility)
  select c.agency_id, c.organization_id, 'client', c.id::text, auth.uid(),
         'DIY step completed', p_stage::text, 'client_visible'
    from public.clients c where c.id = p_client;
end $$;
revoke all on function public.diy_advance(uuid, public.diy_stage) from public, anon;
grant execute on function public.diy_advance(uuid, public.diy_stage) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The upgrade. DIY to managed, with nothing recreated.
-- ---------------------------------------------------------------------------
create or replace function public.diy_upgrade_to_managed(p_client uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.clients; v_case uuid;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then raise exception 'Client not found' using errcode = 'P0002'; end if;
  /* The organization takes the person on; the consumer does not promote
     themself into somebody's managed workload. */
  if not (c.organization_id is not null and public.member_can(c.organization_id, 'creditops.clients.edit')) then
    raise exception 'Only the organization takes a client on' using errcode = '42501';
  end if;

  select id into v_case from public.fulfillment_clients where client_id = p_client;
  if v_case is not null then
    return v_case;   -- already managed; nothing to do and nothing to duplicate
  end if;

  /* The ONLY thing an upgrade creates: a credit case pointing at the same
     person. Reports, documents, activity, consents, the portal login and the
     DIY history are already theirs and are untouched. */
  insert into public.fulfillment_clients
    (agency_id, name, email, phone, mode, organization_id, auto_sync, status, round, created_by, client_id)
  values (c.agency_id, c.full_name, c.email, c.phone, c.mode, c.organization_id,
          false, 'Onboarding', 'Pre-Round', auth.uid(), c.id)
  returning id into v_case;

  update public.clients set provenance = 'diy_converted' where id = p_client and provenance = 'diy_self_serve';

  perform public.log_audit('diy.upgraded_to_managed', 'client', p_client::text, c.organization_id,
                           null, jsonb_build_object('fulfillment_client_id', v_case));
  return v_case;
end $$;
revoke all on function public.diy_upgrade_to_managed(uuid) from public, anon;
grant execute on function public.diy_upgrade_to_managed(uuid) to authenticated;
