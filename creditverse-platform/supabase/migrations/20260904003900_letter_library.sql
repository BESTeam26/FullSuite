-- =============================================================================
-- Letter Library, dispute rounds and letters, attestations, timers,
-- persisted integrity findings (ARCHITECTURE_PROPOSAL_LETTER_LIBRARY.md §1–2
-- and addendum M6–M7).
--
-- Doctrine carried into the schema:
--   Letters come from templates (organization data with BES defaults) or from
--   an approved AI draft; a letter is never sent without the consumer's own
--   attestation (truth gate) and a QA pass (qa gate) — both enforced here, not
--   in the interface. Rounds are records, and "reset the cycle or keep the
--   counter" is a decision stored on the round. Findings are persisted only
--   when a person acts on them or a letter cites them, and they can never
--   claim a raw Metro 2 value or an established violation.
--   Nothing here is deleted: templates are deactivated, letters move status.
-- =============================================================================

create type public.letter_kind as enum ('factual', 'integrity', 'dofd', 'mov', 'escalation', 'freeze', 'alternate_bureau', 'other');
create type public.letter_audience as enum ('cra', 'furnisher', 'collector', 'secondary_bureau', 'cfpb');
create type public.dispute_strategy as enum ('factual', 'integrity', 'hybrid', 'freeze', 'secondary');
create type public.dispute_origin as enum ('consumer_prepared', 'attorney_assisted', 'cro_prepared', 'cra_forwarded');
create type public.dispute_letter_status as enum ('draft', 'approved', 'printed', 'mailed', 'responded', 'closed');
create type public.dispute_timer_kind as enum ('reinvestigation', 'furnisher_notice', 'results_notice', 'reinsertion_watch');
create type public.finding_classification as enum ('observed_difference', 'potential_anomaly', 'evidence_supported_inaccuracy', 'potential_legal_issue');
create type public.finding_disposition as enum ('confirmed', 'dismissed', 'needs_evidence', 'escalated');

-- ---------------------------------------------------------------------------
-- Templates: BES defaults (organization_id null) + an organization's own
-- ---------------------------------------------------------------------------
create table public.letter_templates (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete cascade,
  kind             public.letter_kind not null,
  audience         public.letter_audience not null,
  name             text not null,
  /** Markdown with {{placeholders}}; the set is validated by the builder, listed here for the library screen. */
  body             text not null,
  placeholders     text[] not null default '{}',
  is_active        boolean not null default true,
  version          integer not null default 1,
  supersedes_id    uuid references public.letter_templates(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index letter_templates_org_idx on public.letter_templates (organization_id, kind) where is_active;

-- ---------------------------------------------------------------------------
-- Rounds and letters follow the CreditOps client
-- ---------------------------------------------------------------------------
create table public.dispute_rounds (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.fulfillment_clients(id) on delete cascade,
  round_number  integer not null check (round_number >= 1),
  strategy      public.dispute_strategy not null,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  /** The build-time decision: true = this build closed the previous round and opened this one; false = letters added to the running round. */
  cycle_reset   boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  unique (client_id, round_number)
);
create index dispute_rounds_client_idx on public.dispute_rounds (client_id, round_number desc);

create table public.report_findings (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.fulfillment_clients(id) on delete cascade,
  report_id             uuid not null references public.credit_reports(id) on delete cascade,
  account_ref           text not null,
  rule_id               text not null,
  rule_version          integer not null,
  catalogue_version     text not null,
  classification        public.finding_classification not null,
  verdict               text not null,
  observation           text not null,
  evidence              jsonb not null default '{}'::jsonb,
  fields                text[] not null default '{}',
  route                 text not null,
  remedy                text not null,
  human_review_required boolean not null default false,
  /** Our imports are consumer-facing displays. This can never be true here. */
  raw_metro2_verified   boolean not null default false check (raw_metro2_verified = false),
  human_disposition     public.finding_disposition,
  reviewer              uuid references public.profiles(id) on delete set null,
  reviewer_reason       text,
  reviewed_at           timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (client_id, report_id, account_ref, rule_id, rule_version)
);
create index report_findings_client_idx on public.report_findings (client_id, human_disposition);

create table public.dispute_letters (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.dispute_rounds(id) on delete cascade,
  client_id        uuid not null references public.fulfillment_clients(id) on delete cascade,
  template_id      uuid references public.letter_templates(id) on delete set null,
  recipient_kind   public.letter_audience not null,
  recipient_name   text not null,
  bureau           text check (bureau is null or bureau in ('EQ', 'EX', 'TU')),
  item_ids         uuid[] not null default '{}',      -- report_items cited
  finding_ids      uuid[] not null default '{}',      -- report_findings cited
  evidence_file_ids uuid[] not null default '{}',     -- files enclosed
  dispute_origin   public.dispute_origin not null default 'cro_prepared',
  generated_by     text not null default 'template' check (generated_by in ('template', 'ai')),
  body_final       text not null default '',
  status           public.dispute_letter_status not null default 'draft',
  qa_passed_at     timestamptz,
  qa_by            uuid references public.profiles(id) on delete set null,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  mailed_at        timestamptz,
  responded_at     timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger dispute_letters_updated_at before update on public.dispute_letters for each row execute function public.set_updated_at();
create index dispute_letters_round_idx on public.dispute_letters (round_id);
create index dispute_letters_client_idx on public.dispute_letters (client_id, status);

/** The truth gate. One row per letter; the letter cannot be approved without it. */
create table public.dispute_attestations (
  id           uuid primary key default gen_random_uuid(),
  letter_id    uuid not null unique references public.dispute_letters(id) on delete cascade,
  /** recognises_account yes|no|unsure · disputed_information · reason · documents[] · identity_theft_certification (only when no) */
  statements   jsonb not null,
  attested_by  uuid references public.profiles(id) on delete set null,
  attested_at  timestamptz not null default now(),
  check (statements ? 'recognises_account' and statements ? 'disputed_information' and statements ? 'reason')
);

create table public.dispute_timers (
  id            uuid primary key default gen_random_uuid(),
  letter_id     uuid not null references public.dispute_letters(id) on delete cascade,
  kind          public.dispute_timer_kind not null,
  due_at        timestamptz not null,
  satisfied_at  timestamptz,
  note          text
);
create index dispute_timers_due_idx on public.dispute_timers (due_at) where satisfied_at is null;

-- ---------------------------------------------------------------------------
-- Helpers: who may act on a CreditOps client's letters
-- ---------------------------------------------------------------------------
/** Sees the client (existing policy, INVOKER). */
create or replace function public.credit_client_visible(p_client uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.fulfillment_clients c where c.id = p_client)
$$;
/** May write for the client: the existing update policy decides — a no-op update that touches no column is the cheapest exact test. */
create or replace function public.credit_client_writable(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fulfillment_clients c
                  where c.id = p_client and (
                    (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
                       and public.in_scope(c.agency_id, 'creditops', c.team_id, c.assigned_agent_id, c.created_by))
                    or (c.organization_id is not null and c.outsourcing_group_id is null
                       and public.org_has_product(c.organization_id, 'creditOps')
                       and public.org_scope_allows(c.organization_id, c.assigned_agent_id))))
$$;
create or replace function public.letter_template_visible(p_org uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_org is null and (public.is_agency_staff() or exists (select 1 from public.org_memberships m where m.user_id = auth.uid())))
      or (p_org is not null and (public.is_org_member(p_org) or public.is_manager_of(p_agency)))
$$;
create or replace function public.letter_template_editable(p_org uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_org is null and public.is_manager_of(p_agency))
      or (p_org is not null and public.is_org_admin(p_org) and public.org_has_product(p_org, 'creditOps'))
$$;

-- ---------------------------------------------------------------------------
-- Rounds: open or extend; the decision is recorded, the activity written
-- ---------------------------------------------------------------------------
create or replace function public.open_dispute_round(p_client uuid, p_strategy public.dispute_strategy, p_reset_cycle boolean)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  c        public.fulfillment_clients%rowtype;
  v_open   public.dispute_rounds%rowtype;
  v_id     uuid;
  v_number integer;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(p_client) then raise exception 'Not permitted to build letters for this client' using errcode = '42501'; end if;

  select * into v_open from public.dispute_rounds where client_id = p_client and closed_at is null order by round_number desc limit 1;
  if v_open.id is not null and not p_reset_cycle then
    return v_open.id;                                   -- keep the counter: letters join the running round
  end if;
  if v_open.id is not null then
    update public.dispute_rounds set closed_at = now() where id = v_open.id;
  end if;
  select coalesce(max(round_number), 0) + 1 into v_number from public.dispute_rounds where client_id = p_client;
  insert into public.dispute_rounds (client_id, round_number, strategy, cycle_reset, created_by)
  values (p_client, v_number, p_strategy, p_reset_cycle, auth.uid()) returning id into v_id;
  -- The client's credit-status round is an enum label; the round record keeps the exact number.
  update public.fulfillment_clients
     set round = case when v_number >= 4 then 'Round 4+' else ('Round ' || v_number) end::public.fulfillment_round
   where id = p_client;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(),
          'Dispute round opened', 'Round ' || v_number || ' · ' || p_strategy::text || case when v_open.id is not null then ' (previous round closed)' else '' end,
          'round', coalesce(v_open.round_number::text, null), v_number::text,
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- The QA gate: approval is impossible without the truth gate, a body, a
-- recipient the citations fit, and none of the phrases the doctrine forbids.
-- ---------------------------------------------------------------------------
create or replace function public.letter_prohibited_phrase(p_body text)
returns text language sql immutable as $$
  select (select p from unnest(array[
      'guarantee', 'willful violation', 'willful noncompliance', 'metro 2 violation', 'fraudulent', 'illegal reinsertion',
      'must delete', 'must be deleted', 'unverifiable because', 'data breach', 'you are required to ensure maximum possible accuracy'
    ]) as p where lower(p_body) like '%' || p || '%' limit 1)
$$;

create or replace function public.approve_dispute_letter(p_letter uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  l public.dispute_letters%rowtype;
  c public.fulfillment_clients%rowtype;
  v_bad text;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(l.client_id) then raise exception 'Not permitted to approve letters for this client' using errcode = '42501'; end if;
  if l.status <> 'draft' then raise exception 'Only a draft can be approved' using errcode = '22023'; end if;
  if length(trim(l.body_final)) < 40 then raise exception 'The letter has no body' using errcode = '22023'; end if;
  if not exists (select 1 from public.dispute_attestations a where a.letter_id = p_letter) then
    raise exception 'The consumer attestation (truth gate) is missing' using errcode = '22023';
  end if;
  if l.recipient_kind = 'furnisher' and (l.body_final ilike '%1681e(b)%') then
    raise exception 'Section 1681e(b) is a consumer reporting agency duty; it cannot be cited to a furnisher' using errcode = '22023';
  end if;
  if l.recipient_kind = 'furnisher' and l.dispute_origin = 'cro_prepared' and l.body_final ilike '%1022.43%' then
    raise exception 'A credit-repair-organization-prepared direct dispute cannot rely on 12 C.F.R. § 1022.43; use the CRA route' using errcode = '22023';
  end if;
  v_bad := public.letter_prohibited_phrase(l.body_final);
  if v_bad is not null then raise exception 'The letter contains a prohibited phrase: "%"', v_bad using errcode = '22023'; end if;

  update public.dispute_letters set status = 'approved', approved_by = auth.uid(), approved_at = now(), qa_passed_at = now(), qa_by = auth.uid() where id = p_letter;

  select * into c from public.fulfillment_clients where id = l.client_id;
  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (c.agency_id, c.organization_id, 'fulfillment_client', l.client_id::text, auth.uid(),
          'Letter approved', l.recipient_name || ' · ' || l.recipient_kind::text, 'letter:' || p_letter::text, 'draft', 'approved',
          case when public.is_staff_of(c.agency_id) and c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               when public.is_staff_of(c.agency_id) then 'bes_internal'
               when c.organization_id is not null and public.bes_engaged_with(c.organization_id) then 'shared_with_partner'
               else 'organization_internal' end::public.activity_visibility);
end $$;

/** Mailing starts the statutory clocks as data (30 days; a further 15 only when new information is supplied; notices at 5 business days). */
create or replace function public.mark_letter_mailed(p_letter uuid, p_mailed_at timestamptz default now())
returns void language plpgsql security invoker set search_path = public as $$
declare l public.dispute_letters%rowtype;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not visible' using errcode = '42501'; end if;
  if not public.credit_client_writable(l.client_id) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if l.status not in ('approved', 'printed') then raise exception 'Only an approved letter can be mailed' using errcode = '22023'; end if;
  update public.dispute_letters set status = 'mailed', mailed_at = p_mailed_at where id = p_letter;
  if l.recipient_kind = 'cra' then
    insert into public.dispute_timers (letter_id, kind, due_at, note) values
      (p_letter, 'furnisher_notice', p_mailed_at + interval '5 days', 'CRA notice to the furnisher — 5 business days (approximated as 5 calendar days; check the calendar)'),
      (p_letter, 'reinvestigation', p_mailed_at + interval '30 days', '30 days; +15 only if the consumer supplies new relevant information during the reinvestigation'),
      (p_letter, 'results_notice', p_mailed_at + interval '35 days', 'written results within 5 business days of completion'),
      (p_letter, 'reinsertion_watch', p_mailed_at + interval '120 days', 'compare the next imports for reappearance of any deleted item');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.letter_templates     enable row level security;
alter table public.dispute_rounds       enable row level security;
alter table public.report_findings      enable row level security;
alter table public.dispute_letters      enable row level security;
alter table public.dispute_attestations enable row level security;
alter table public.dispute_timers       enable row level security;
revoke all on public.letter_templates, public.dispute_rounds, public.report_findings, public.dispute_letters, public.dispute_attestations, public.dispute_timers from public, anon;
grant select, insert, update on public.letter_templates, public.report_findings, public.dispute_letters, public.dispute_timers to authenticated;
grant select, insert on public.dispute_rounds, public.dispute_attestations to authenticated;   -- rounds move only through the function; an attestation is never edited

create policy letter_templates_select on public.letter_templates for select to authenticated using (public.letter_template_visible(organization_id, agency_id));
create policy letter_templates_insert on public.letter_templates for insert to authenticated with check (public.letter_template_editable(organization_id, agency_id));
create policy letter_templates_update on public.letter_templates for update to authenticated
  using (public.letter_template_editable(organization_id, agency_id)) with check (public.letter_template_editable(organization_id, agency_id));

create policy dispute_rounds_select on public.dispute_rounds for select to authenticated using (public.credit_client_visible(client_id));
create policy dispute_rounds_insert on public.dispute_rounds for insert to authenticated with check (public.credit_client_writable(client_id));

create policy report_findings_select on public.report_findings for select to authenticated using (public.credit_client_visible(client_id));
create policy report_findings_insert on public.report_findings for insert to authenticated with check (public.credit_client_writable(client_id));
create policy report_findings_update on public.report_findings for update to authenticated using (public.credit_client_writable(client_id)) with check (public.credit_client_writable(client_id));

create policy dispute_letters_select on public.dispute_letters for select to authenticated using (public.credit_client_visible(client_id));
create policy dispute_letters_insert on public.dispute_letters for insert to authenticated with check (public.credit_client_writable(client_id) and status = 'draft');
create policy dispute_letters_update on public.dispute_letters for update to authenticated using (public.credit_client_writable(client_id)) with check (public.credit_client_writable(client_id));

create policy dispute_attestations_select on public.dispute_attestations for select to authenticated
  using (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_visible(l.client_id)));
create policy dispute_attestations_insert on public.dispute_attestations for insert to authenticated
  with check (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_writable(l.client_id)));

create policy dispute_timers_select on public.dispute_timers for select to authenticated
  using (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_visible(l.client_id)));
create policy dispute_timers_insert on public.dispute_timers for insert to authenticated
  with check (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_writable(l.client_id)));
create policy dispute_timers_update on public.dispute_timers for update to authenticated
  using (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_writable(l.client_id)))
  with check (exists (select 1 from public.dispute_letters l where l.id = letter_id and public.credit_client_writable(l.client_id)));

revoke execute on function
  public.credit_client_visible(uuid), public.credit_client_writable(uuid), public.letter_template_visible(uuid, uuid), public.letter_template_editable(uuid, uuid),
  public.open_dispute_round(uuid, public.dispute_strategy, boolean), public.letter_prohibited_phrase(text), public.approve_dispute_letter(uuid), public.mark_letter_mailed(uuid, timestamptz)
  from public, anon;
grant execute on function
  public.credit_client_visible(uuid), public.credit_client_writable(uuid), public.letter_template_visible(uuid, uuid), public.letter_template_editable(uuid, uuid),
  public.open_dispute_round(uuid, public.dispute_strategy, boolean), public.letter_prohibited_phrase(text), public.approve_dispute_letter(uuid), public.mark_letter_mailed(uuid, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- BES default templates (wording from the Credit Reporting Integrity addendum;
-- the builder fills {{placeholders}} from the canonical report items and the
-- attestation, never from free text).
-- ---------------------------------------------------------------------------
insert into public.letter_templates (agency_id, organization_id, kind, audience, name, body, placeholders)
select a.id, null, t.kind::public.letter_kind, t.audience::public.letter_audience, t.name, t.body, t.placeholders
from public.agencies a
cross join (values
  ('factual', 'cra', 'Factual dispute — consumer reporting agency',
$body$Subject: Dispute of inaccurate or incomplete credit information

I am disputing the accuracy of the following information on my credit report.

Furnisher: {{furnisher_name}}
Account: {{account_masked}}
Report date: {{report_date}}
Information disputed: {{disputed_field}}

My report states {{reported_value}}. The attached {{evidence_description}}, dated {{evidence_date}}, shows {{correct_fact}}.

I am requesting a reasonable reinvestigation of this specific information under the Fair Credit Reporting Act. Please review the enclosed evidence and correct the information. If the disputed information cannot be verified as complete and accurate, please delete it as appropriate under 15 U.S.C. § 1681i.

Please send me the results of your reinvestigation and an updated copy of my report.

{{consumer_name}}
{{consumer_address}}$body$,
   array['furnisher_name','account_masked','report_date','disputed_field','reported_value','evidence_description','evidence_date','correct_fact','consumer_name','consumer_address']),

  ('integrity', 'cra', 'Internally inconsistent reporting — consumer reporting agency',
$body$Subject: Dispute of internally inconsistent account information

My credit report contains internally inconsistent information concerning this account.

Furnisher: {{furnisher_name}}
Account: {{account_masked}}
Report date: {{report_date}}

It reports the account as {{status_reported}} while also reporting {{contradicting_field}} as {{contradicting_value}}.

I understand that Metro 2 is the standardized format furnishers use to transmit account information to consumer reporting agencies. My dispute is not based on a formatting preference. I am disputing the underlying factual inconsistency.

Please review the furnisher's underlying records and all information I have provided. If the information is inaccurate or incomplete, please correct it. If it cannot be verified, please delete it as appropriate under the Fair Credit Reporting Act.

{{consumer_name}}
{{consumer_address}}$body$,
   array['furnisher_name','account_masked','report_date','status_reported','contradicting_field','contradicting_value','consumer_name','consumer_address']),

  ('dofd', 'cra', 'Date of first delinquency — consumer reporting agency',
$body$Subject: Dispute of the reported date of first delinquency

I am disputing the reported date of first delinquency for this account.

Furnisher: {{furnisher_name}}
Account: {{account_masked}}
Report date: {{report_date}}

The report shows {{dofd_reported}}. The enclosed account records show that the delinquency immediately preceding {{collection_or_chargeoff}} began in {{dofd_documented}}.

Please reinvestigate the accuracy of the delinquency date. The Fair Credit Reporting Act specifically regulates the reporting of the date of delinquency for accounts placed for collection or charged off. Please correct the date to the substantiated date and remove any information that has become obsolete under the Act based on the corrected reporting period.

{{consumer_name}}
{{consumer_address}}$body$,
   array['furnisher_name','account_masked','report_date','dofd_reported','collection_or_chargeoff','dofd_documented','consumer_name','consumer_address']),

  ('mov', 'cra', 'Description of reinvestigation procedure — consumer reporting agency',
$body$Subject: Request for a description of the procedure used in my reinvestigation

On {{results_date}} you sent me the results of the reinvestigation I requested on {{dispute_date}} concerning {{furnisher_name}}, account {{account_masked}}.

Please provide the description of the procedure used to determine the accuracy and completeness of the disputed information as provided by 15 U.S.C. § 1681i(a)(7), including the business name, address and telephone number of any furnisher contacted, if reasonably available.

{{consumer_name}}
{{consumer_address}}$body$,
   array['results_date','dispute_date','furnisher_name','account_masked','consumer_name','consumer_address']),

  ('escalation', 'cra', 'Unresolved factual dispute after reinvestigation — consumer reporting agency',
$body$Subject: Unresolved factual dispute following reinvestigation

I previously disputed this account on {{dispute_date}}, and I received your result on {{results_date}}.

The specific inaccuracy remains unresolved.

Furnisher: {{furnisher_name}}
Account: {{account_masked}}

Your report continues to show {{reported_value}}. The enclosed {{evidence_description}} shows {{correct_fact}}.

I am including {{new_evidence_description}} that directly addresses the information being reported. Please conduct a reasonable reinvestigation, review all relevant information, and correct the disputed data. If the information cannot be verified as complete and accurate, please delete it as appropriate.

Please provide the results of the reinvestigation.

{{consumer_name}}
{{consumer_address}}$body$,
   array['dispute_date','results_date','furnisher_name','account_masked','reported_value','evidence_description','correct_fact','new_evidence_description','consumer_name','consumer_address']),

  ('freeze', 'secondary_bureau', 'Security freeze request — secondary consumer reporting agency',
$body$Subject: Request to place a security freeze on my consumer file

To {{registry_name}}:

I request that you place a security freeze on my consumer file.

Name: {{consumer_name}}
Date of birth: {{consumer_dob}}
Current address: {{consumer_address}}
Enclosed: proof of identity and address as your procedures require.

Please confirm in writing when the freeze is in place and provide the means to lift it temporarily or permanently.

{{consumer_name}}$body$,
   array['registry_name','consumer_name','consumer_dob','consumer_address'])
) as t(kind, audience, name, body, placeholders);
