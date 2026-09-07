-- 0159 — a Partner is a commercial relationship, not a CreditOps client.
--
-- ---------------------------------------------------------------------------
-- THE CANONICAL DEFINITION (Dee, 2026-09-07). This overrides every narrower
-- reading that came before it.
--
--   A BES PARTNER is a company or person with whom BES has a commercial
--   service relationship.
--
-- The partner is the ACCOUNT. What BES does for them are SERVICE ENGAGEMENTS
-- underneath it. Someone who bought one $3,000 GHL build and nothing else is
-- a partner. So is an hourly TalentOps arrangement, a monthly retainer, a CRM
-- subscription, and a CreditOps fulfilment company with 536 end clients.
--
--   ONE PARTNER
--     → zero or many CONTACTS
--     → zero or many CLIENTS          (optional — a build client has none)
--     → one or many SERVICE ENGAGEMENTS over its lifetime
--     → zero or many TEAM ASSIGNMENTS
--     → zero or many FILES
--     → zero or many FINANCIAL RECORDS
--     → zero or one ACTIVE PORTAL relationship per authorised contact
--     → complete ACTIVITY history
--
-- ---------------------------------------------------------------------------
-- TWO SEPARATIONS THIS MIGRATION EXISTS TO ENFORCE
--
-- 1. LIFECYCLE IS NOT SERVICE. The ClickUp list this replaces has statuses
--    like "active partner creditops" and "active partner full", which encode
--    WHAT they buy inside WHETHER they are active. A partner who cancels one
--    build is not archived. So: `outsourcing_groups.lifecycle` describes the
--    relationship, `partner_services.status` describes one service, and
--    neither is derivable from the other.
--
-- 2. `partner_services` IS NOT `fulfillment_engagements`. They sound alike and
--    are opposite things. A `fulfillment_engagement` is an AUTHORIZATION — it
--    is what `bes_may_fulfil()` reads to decide whether BES staff may open a
--    customer's operational records (rule 16). A `partner_service` is a
--    COMMERCIAL LINE — what BES sells, to whom, on what terms. A GHL build has
--    a commercial line and grants no data access whatsoever. Never collapse
--    them; a billing row must never widen what anyone can read.
-- ---------------------------------------------------------------------------

-- ── Vocabulary ──────────────────────────────────────────────────────────
create type public.partner_lifecycle as enum
  ('new', 'onboarding', 'active', 'on_hold', 'suspended', 'archived');

/* An operational judgement a human records, never a number the system infers.
   Revenue and client count do not decide whether a partner is unhappy. */
create type public.partner_health as enum
  ('happy', 'neutral', 'concerned', 'at_risk');

create type public.partner_billing_status as enum
  ('active', 'invoice_pending', 'overdue', 'paused', 'cancelled');

-- ── Catalogues: what BES sells, and how it charges ──────────────────────
--
-- Rows, not enums. Rule 17: customisation is data. BES adds a service by
-- inserting a row, not by shipping a migration and a deploy.

create table public.partner_service_types (
  code      text primary key,
  label     text not null,
  /* Groups the catalogue for a human. Not authorization, not billing. */
  category  text not null,
  sort      integer not null default 0,
  active    boolean not null default true
);

create table public.partner_billing_models (
  code      text primary key,
  label     text not null,
  /* The thing the rate is per: 'month', 'week', 'hour', 'client', 'agent',
     'round', 'project'. NULL where the arrangement has no unit. */
  unit      text,
  recurring boolean not null default false,
  sort      integer not null default 0,
  active    boolean not null default true
);

create table public.partner_payment_channels (
  code      text primary key,
  label     text not null,
  sort      integer not null default 0,
  active    boolean not null default true
);

insert into public.partner_service_types (code, label, category, sort) values
  ('CREDITOPS_FULFILLMENT',  'CreditOps Fulfillment',  'Fulfillment', 10),
  ('CLIENT_SUPPORT',         'Client Support',         'Staffing',    20),
  ('DEDICATED_STAFF',        'Dedicated Staff',        'Staffing',    30),
  ('CLIENT_SUCCESS',         'Client Success Support', 'Staffing',    40),
  ('OPERATIONS_MANAGEMENT',  'Operations Management',  'Staffing',    50),
  ('EXECUTIVE_ASSISTANT',    'Executive Assistant',    'Staffing',    60),
  ('TALENTOPS',              'TalentOps',              'Staffing',    70),
  ('BES_CRM',                'BES CRM',                'Platform',    80),
  ('GHL_BUILD',              'GHL Build',              'Project',     90),
  ('AUTOMATION_BUILD',       'Automation Build',       'Project',    100),
  ('WEBSITE_BUILD',          'Website Build',          'Project',    110),
  ('FUNNEL_BUILD',           'Funnel Build',           'Project',    120),
  ('MONTHLY_RETAINER',       'Monthly Retainer',       'Retainer',   130),
  ('HOURLY_SUPPORT',         'Hourly Support',         'Staffing',   140),
  ('CONSULTING',             'Consulting',             'Advisory',   150),
  ('FUNDINGOPS',             'FundingOps',             'Fulfillment',160),
  ('CUSTOM',                 'Custom service',         'Other',      900);

insert into public.partner_billing_models (code, label, unit, recurring, sort) values
  ('RECURRING_WEEKLY',   'Weekly',            'week',    true,  10),
  ('RECURRING_BIWEEKLY', 'Every two weeks',   'week',    true,  20),
  ('RECURRING_MONTHLY',  'Monthly',           'month',   true,  30),
  ('RETAINER',           'Retainer',          'month',   true,  40),
  ('PER_CLIENT',         'Per client',        'client',  true,  50),
  ('PER_ROUND',          'Per round',         'round',   true,  60),
  ('PER_AGENT',          'Per agent',         'agent',   true,  70),
  ('HOURLY',             'Hourly',            'hour',    false, 80),
  ('FIXED_PROJECT',      'Fixed price',       'project', false, 90),
  ('ONE_TIME',           'One time',          null,      false, 100),
  ('CUSTOM',             'Custom arrangement', null,     false, 900);

/* Blank is NOT "unpaid" — it is "nobody recorded it". UNKNOWN exists so the
   difference survives migration instead of being read as a missed payment. */
insert into public.partner_payment_channels (code, label, sort) values
  ('AUTHORIZE_NET', 'Authorize.Net',    10),
  ('STRIPE',        'Stripe',           20),
  ('PAYPAL',        'PayPal',           30),
  ('WISE',          'Wise',             40),
  ('GHL_INVOICE',   'GHL Invoice',      50),
  ('UPWORK',        'Upwork',           60),
  ('BANK_TRANSFER', 'Bank transfer',    70),
  ('OTHER',         'Other',            800),
  ('UNKNOWN',       'Not recorded',     900);

alter table public.partner_service_types    enable row level security;
alter table public.partner_billing_models   enable row level security;
alter table public.partner_payment_channels enable row level security;
revoke all on public.partner_service_types, public.partner_billing_models,
              public.partner_payment_channels from public, anon;
grant select on public.partner_service_types, public.partner_billing_models,
                public.partner_payment_channels to authenticated;

/* A catalogue of what BES sells is not a secret from BES staff, and a partner
   contact reads it too — their own service names come from it. It carries no
   price and no partner, so there is nothing here to scope. */
create policy partner_service_types_select on public.partner_service_types
  for select to authenticated using (true);
create policy partner_billing_models_select on public.partner_billing_models
  for select to authenticated using (true);
create policy partner_payment_channels_select on public.partner_payment_channels
  for select to authenticated using (true);

-- ── The partner account ─────────────────────────────────────────────────
alter table public.outsourcing_groups
  add column if not exists lifecycle public.partner_lifecycle not null default 'new',
  add column if not exists health    public.partner_health,
  add column if not exists health_note       text,
  add column if not exists health_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists health_changed_at timestamptz,
  /** When the commercial relationship began. "Days active" is derived from it. */
  add column if not exists started_on date,
  add column if not exists ended_on   date,
  /** The BES SaaS plan, if they also subscribe. NOT a service they buy. */
  add column if not exists saas_plan text,
  add column if not exists account_manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists team_id            uuid references public.teams(id) on delete set null,
  add column if not exists primary_contact_id uuid references public.partner_contacts(id) on delete set null,
  /** What the spreadsheet said, kept verbatim: "300-400", "60 Average". */
  add column if not exists legacy_reported_client_volume text,
  add column if not exists legacy_reported_active_clients integer,
  /** Where this row came from, so legacy and native records stay tellable apart. */
  add column if not exists source_type      text not null default 'bes',
  add column if not exists source_reference text,
  add column if not exists source_row_ref   text,
  add column if not exists import_batch_id  uuid,
  add column if not exists imported_at      timestamptz,
  /** Set where a legacy record carried a password or key that must NOT be
      copied into an ordinary field. Flags it for a real vault, later. */
  add column if not exists credential_migration_required boolean not null default false,
  add column if not exists credential_note text;

alter table public.outsourcing_groups
  add constraint outsourcing_groups_source_ck
    check (source_type in ('bes', 'legacy_tracker', 'clickup', 'legacy_spreadsheet')),
  add constraint outsourcing_groups_dates_ck
    check (ended_on is null or started_on is null or ended_on >= started_on);

comment on column public.outsourcing_groups.lifecycle is
  'The RELATIONSHIP. Not what they buy: a partner whose only build project completed is still ACTIVE if any other engagement is live. Service state lives on partner_services.status.';
comment on column public.outsourcing_groups.health is
  'A recorded human judgement of how the relationship feels. Never inferred from revenue or client count.';
comment on column public.outsourcing_groups.credential_migration_required is
  'A legacy record carried a credential. It was NOT copied into any field here. Marked for a vault mechanism that encrypts and audits, which this table is not.';
comment on column public.outsourcing_groups.status is
  'LEGACY. `lifecycle` is canonical; a trigger keeps this mirrored so older readers do not go stale. Write lifecycle.';

/* One direction only: lifecycle is the source, status the mirror. Two writable
   columns meaning the same thing is how they drift apart. */
create or replace function public.partner_mirror_lifecycle()
returns trigger language plpgsql set search_path = public as $function$
begin
  new.status := case new.lifecycle
    when 'active'     then 'Active'
    when 'onboarding' then 'Onboarding'
    when 'on_hold'    then 'Paused'
    when 'suspended'  then 'Suspended'
    when 'archived'   then 'Archived'
    else 'Onboarding'
  end::public.outsourcing_group_status;
  new.archived_at := case when new.lifecycle = 'archived'
                          then coalesce(new.archived_at, now()) else null end;
  return new;
end;
$function$;

create trigger outsourcing_groups_mirror_lifecycle
  before insert or update of lifecycle on public.outsourcing_groups
  for each row execute function public.partner_mirror_lifecycle();

/* Lifecycle from the legacy status, once. 'Paused' is the closest existing
   meaning to on_hold; nothing here invents a state the data did not have. */
update public.outsourcing_groups set lifecycle =
  case status::text
    when 'Active'     then 'active'
    when 'Onboarding' then 'onboarding'
    when 'Paused'     then 'on_hold'
    when 'Suspended'  then 'suspended'
    when 'Archived'   then 'archived'
    else 'new'
  end::public.partner_lifecycle
where lifecycle = 'new';

update public.outsourcing_groups set lifecycle = 'archived'
where archived_at is not null and lifecycle <> 'archived';

update public.outsourcing_groups set started_on = created_at::date
where started_on is null;

create index if not exists outsourcing_groups_lifecycle_idx
  on public.outsourcing_groups (agency_id, lifecycle);
create index if not exists outsourcing_groups_health_idx
  on public.outsourcing_groups (agency_id, health) where health in ('concerned', 'at_risk');

-- ── Portal access follows the lifecycle, not the legacy status ──────────
create or replace function public.partner_group_of_user()
returns uuid language sql stable security definer set search_path = public as $function$
  select c.group_id
    from public.partner_contacts c
    join public.outsourcing_groups g on g.id = c.group_id
   where c.user_id = auth.uid()
     and c.status = 'active'
     and g.lifecycle not in ('suspended', 'archived')
   limit 1
$function$;

-- ── A service engagement, whatever shape it takes ───────────────────────
alter table public.partner_services
  add column if not exists service_type text references public.partner_service_types(code),
  add column if not exists description  text,
  /** What the spreadsheet said about volume, verbatim: "14 Active Clients". */
  add column if not exists client_volume_text text,
  add column if not exists source_type      text not null default 'bes',
  add column if not exists source_reference text,
  add column if not exists source_row_ref   text,
  add column if not exists import_batch_id  uuid,
  add column if not exists imported_at      timestamptz;

alter table public.partner_services
  add constraint partner_services_source_ck
    check (source_type in ('bes', 'legacy_tracker', 'clickup', 'legacy_spreadsheet'));

comment on table public.partner_services is
  'One COMMERCIAL service engagement: what BES sells to one partner. Recurring, per-client, hourly, retainer or a one-time build — all the same row shape. NOT fulfillment_engagements, which is an authorization record and the only thing that grants BES access to a customer''s data.';
comment on column public.partner_services.status is
  'This SERVICE''s state. Cancelling it does not archive the partner; completing a build does not end the relationship.';

create index if not exists partner_services_type_idx
  on public.partner_services (group_id, service_type);

-- ── Commercial terms, still in their own table ──────────────────────────
alter table public.partner_service_billing
  add column if not exists billing_model  text references public.partner_billing_models(code),
  add column if not exists billing_status public.partner_billing_status,
  add column if not exists mrr_cents      bigint check (mrr_cents is null or mrr_cents >= 0),
  add column if not exists contracted_hours numeric check (contracted_hours is null or contracted_hours >= 0),
  /** What was actually agreed, in the currency it was agreed in, with the rate
      used AT THE TIME. Historical amounts are never recomputed at today's FX. */
  add column if not exists currency_original text,
  add column if not exists fx_rate_used      numeric check (fx_rate_used is null or fx_rate_used > 0);

alter table public.partner_service_billing
  add constraint partner_billing_transaction_ck
    check (transaction_type is null or transaction_type in ('business', 'personal'));

/* Existing free-text channels become catalogue codes where they match, and
   UNKNOWN where they are blank — which is a different fact from unpaid. */
update public.partner_service_billing set payment_channel =
  case upper(regexp_replace(coalesce(payment_channel, ''), '[^A-Za-z]', '', 'g'))
    when 'AUTHORIZENET' then 'AUTHORIZE_NET'
    when 'AUTHORIZEDNET' then 'AUTHORIZE_NET'
    when 'STRIPE'  then 'STRIPE'
    when 'PAYPAL'  then 'PAYPAL'
    when 'WISE'    then 'WISE'
    when 'UPWORK'  then 'UPWORK'
    when 'GHLINVOICE' then 'GHL_INVOICE'
    when ''        then 'UNKNOWN'
    else 'OTHER'
  end;
alter table public.partner_service_billing
  alter column payment_channel set default 'UNKNOWN',
  add constraint partner_service_billing_channel_fk
    foreign key (payment_channel) references public.partner_payment_channels(code);

comment on column public.partner_service_billing.fx_rate_used is
  'The conversion rate used for THIS record when it was agreed. The tracker holds several historical PHP assumptions; recomputing an old amount at today''s rate would silently rewrite history.';

-- ── Revenue keeps the currency it was collected in ──────────────────────
alter table public.partner_revenue_entries
  add column if not exists currency_original      text,
  add column if not exists amount_original_cents  bigint,
  add column if not exists fx_rate_used           numeric check (fx_rate_used is null or fx_rate_used > 0),
  add column if not exists converted_currency     text,
  add column if not exists converted_amount_cents bigint,
  add column if not exists source_type      text not null default 'bes',
  add column if not exists source_reference text,
  add column if not exists import_batch_id  uuid,
  add column if not exists imported_at      timestamptz;

alter table public.partner_revenue_entries
  add constraint partner_revenue_source_ck
    check (source_type in ('bes', 'legacy_tracker', 'clickup', 'legacy_spreadsheet'));

-- ── Operations keeps configuration; assignment moved to the account ─────
--
-- Who runs the account is relationship-level and belongs on the partner, so
-- the header can show it without opening the operations record. The OPERATIONS
-- manager stays here: that is a configuration of how the work runs.
update public.outsourcing_groups g
   set account_manager_id = coalesce(g.account_manager_id, o.account_manager_id),
       team_id            = coalesce(g.team_id, o.team_id)
  from public.partner_operations o
 where o.group_id = g.id;

alter table public.partner_operations
  drop column if exists account_manager_id,
  drop column if exists team_id;

comment on table public.partner_operations is
  'How the work runs for this partner: which CRM, which mailing system, which SOP, which channel. Names, links and notes only — NEVER a credential.';

-- ── Health is recorded, with who and when ───────────────────────────────
create or replace function public.set_partner_health(
  p_group  uuid,
  p_health public.partner_health,
  p_note   text default null
)
returns void language plpgsql security invoker set search_path = public as $function$
begin
  /* INVOKER on purpose: the ordinary update policy decides who may do this,
     so there is no second permission rule to keep in step with the first. */
  update public.outsourcing_groups
     set health = p_health,
         health_note = nullif(trim(coalesce(p_note, '')), ''),
         health_changed_by = auth.uid(),
         health_changed_at = now()
   where id = p_group;
  if not found then
    raise exception 'Partner not found, or not yours to change';
  end if;
end;
$function$;
revoke execute on function public.set_partner_health(uuid, public.partner_health, text) from public, anon;
grant execute on function public.set_partner_health(uuid, public.partner_health, text) to authenticated;

-- ── Lifecycle and health changes are history ────────────────────────────
create or replace function public.partner_record_change()
returns trigger language plpgsql security invoker set search_path = public as $function$
declare
  v_actor text;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  if new.lifecycle is distinct from old.lifecycle then
    insert into public.activity_events
      (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
       previous_value, new_value, visibility)
    values (new.agency_id, 'partner', new.id::text, auth.uid(), v_actor,
            'Lifecycle changed', 'lifecycle',
            old.lifecycle::text, new.lifecycle::text, 'bes_internal');
  end if;

  if new.health is distinct from old.health then
    insert into public.activity_events
      (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
       previous_value, new_value, detail, visibility)
    values (new.agency_id, 'partner', new.id::text, auth.uid(), v_actor,
            'Partner health changed', 'health',
            old.health::text, new.health::text, new.health_note, 'bes_internal');
  end if;

  return null;
end;
$function$;

create trigger outsourcing_groups_record_change
  after update on public.outsourcing_groups
  for each row execute function public.partner_record_change();

/* `entity_visible` returned TRUE for any type it did not know, so a partner
   activity row could be written against a partner the writer cannot see. */
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    else true
  end
$function$;

-- ── Derived counts, in one query rather than one per partner ────────────
--
-- Deliberate and bounded: a partner's client COUNT is a fact about the
-- relationship, and any staff member who may see partners may see it. It does
-- not open a single client record — those stay behind fulfillment_clients'
-- own policies, which is where an engagement and a scope are checked.
create or replace function public.partner_client_counts()
returns table (group_id uuid, active_clients integer, total_clients integer)
language sql stable security definer set search_path = public as $function$
  select c.outsourcing_group_id,
         count(*) filter (where c.status not in ('Graduated', 'Archived'))::integer,
         count(*)::integer
    from public.fulfillment_clients c
    join public.outsourcing_groups g on g.id = c.outsourcing_group_id
   where c.outsourcing_group_id is not null
     and public.is_staff_of(g.agency_id)
     and public.agency_can('partners.view')
   group by c.outsourcing_group_id
$function$;
revoke execute on function public.partner_client_counts() from public, anon;
grant execute on function public.partner_client_counts() to authenticated;

comment on function public.partner_client_counts() is
  'How many end clients each partner has. One call for the whole list — the alternative is a query per partner, which rule 14 forbids. A count, never a record.';
