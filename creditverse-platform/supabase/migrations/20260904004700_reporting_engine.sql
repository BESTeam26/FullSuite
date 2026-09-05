-- =============================================================================
-- 0069 — Reporting engine (ARCHITECTURE_PROPOSAL_REPORTING.md): KPIs as data,
-- organization KPI settings, manual round outcomes, one facts view, one pivot.
--
--   kpi_definitions            the catalogue: key, label, source, aggregation, match (jsonb), owner
--   organization_kpi_settings  which KPIs an organization shows, in what order, with what target
--   client_round_outcomes      manual outcomes for clients worked in an outside CRM (provenance = manual)
--   report_facts               SECURITY INVOKER view: one common shape over production, time,
--                              status changes, letters, submissions, funded deals, manual outcomes.
--                              RLS on every underlying table decides what a caller sees.
--   report_pivot()             rows = a whitelisted dimension, columns = KPIs, filters, period;
--                              SECURITY INVOKER over the view; deterministic SQL assembled from
--                              the catalogue rows, never from client text.
-- =============================================================================

create table public.kpi_definitions (
  key          text primary key,                                   -- module.metric
  label        text not null,
  description  text,
  service      text not null check (service in ('creditops', 'fundingops', 'operations', 'shared')),
  source       text not null check (source in ('production', 'time', 'status_change', 'letter', 'submission', 'funded', 'manual_outcome')),
  aggregation  text not null check (aggregation in ('count', 'sum_quantity', 'sum_minutes', 'sum_amount', 'count_distinct_client')),
  match        jsonb not null default '{}'::jsonb,                 -- {"outcome":"mailed"} — equality filters on fact columns
  bes_internal boolean not null default false,                     -- never shown to organizations
  sort         integer not null default 0
);

create table public.organization_kpi_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kpi_key         text not null references public.kpi_definitions(key) on delete cascade,
  enabled         boolean not null default true,
  target          numeric,
  sort            integer not null default 0,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, kpi_key)
);

/** Manual outcomes: what the bureaus did in a round, typed by the person who worked the outside CRM. */
create table public.client_round_outcomes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.fulfillment_clients(id) on delete cascade,
  round_number    integer not null check (round_number >= 1),
  bureau          text not null check (bureau in ('EQ', 'EX', 'TU')),
  items_disputed  integer not null default 0 check (items_disputed >= 0),
  deleted         integer not null default 0 check (deleted >= 0),
  updated         integer not null default 0 check (updated >= 0),
  verified        integer not null default 0 check (verified >= 0),
  outcome_date    date not null default current_date,
  source          text not null default 'manual' check (source in ('manual')),
  note            text,
  recorded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (client_id, round_number, bureau, outcome_date)
);
create index client_round_outcomes_client_idx on public.client_round_outcomes (client_id, round_number);

-- Catalogue ---------------------------------------------------------------------
insert into public.kpi_definitions (key, label, description, service, source, aggregation, match, bes_internal, sort) values
  ('production.units',        'Production units',          'Units logged, voided excluded',                     'operations', 'production',     'sum_quantity',          '{}',                       true,  10),
  ('production.entries',      'Production entries',        'Production log rows',                              'operations', 'production',     'count',                 '{}',                       true,  11),
  ('time.minutes',            'Minutes worked',            'Closed time entries',                              'operations', 'time',           'sum_minutes',           '{}',                       true,  12),
  ('clients.status_changes',  'Client status changes',     'Status transitions on CreditOps clients',          'creditops',  'status_change',  'count',                 '{}',                       false, 20),
  ('letters.built',           'Letters built',             'Dispute letters created',                          'creditops',  'letter',         'count',                 '{"outcome":"built"}',      false, 21),
  ('letters.mailed',          'Letters mailed',            'Dispute letters marked mailed',                    'creditops',  'letter',         'count',                 '{"outcome":"mailed"}',     false, 22),
  ('letters.responded',       'Responses received',        'Dispute letters with a recorded response',         'creditops',  'letter',         'count',                 '{"outcome":"responded"}',  false, 23),
  ('letters.clients_mailed',  'Clients with mail out',     'Distinct clients with a mailed letter',            'creditops',  'letter',         'count_distinct_client', '{"outcome":"mailed"}',     false, 24),
  ('outcomes.deleted',        'Items deleted (manual)',    'Deletions recorded manually from an outside CRM',  'creditops',  'manual_outcome', 'sum_quantity',          '{"outcome":"deleted"}',    false, 25),
  ('outcomes.updated',        'Items updated (manual)',    'Updates recorded manually',                        'creditops',  'manual_outcome', 'sum_quantity',          '{"outcome":"updated"}',    false, 26),
  ('outcomes.verified',       'Items verified (manual)',   'Verified-as-reported recorded manually',           'creditops',  'manual_outcome', 'sum_quantity',          '{"outcome":"verified"}',   false, 27),
  ('funding.submissions',     'Submissions',               'Submissions sent to lenders',                      'fundingops', 'submission',     'count',                 '{}',                       false, 30),
  ('funding.funded_count',    'Funded deals',              'Confirmed fundings',                               'fundingops', 'funded',         'count',                 '{}',                       false, 31),
  ('funding.funded_gross',    'Funded volume (gross)',     'Gross funded, as confirmed',                       'fundingops', 'funded',         'sum_amount',            '{}',                       false, 32);

-- Facts -------------------------------------------------------------------------
create or replace view public.report_facts
with (security_invoker = true) as
  select 'production'::text as source, p.work_date as fact_date, p.agency_id, p.organization_id, p.outsourcing_group_id,
         p.division_id as service, p.department::text as department, p.employee_id, p.client_id, null::uuid as funding_file_id,
         p.production_unit_type as unit, p.production_unit_quantity::numeric as quantity, null::integer as minutes, null::numeric as amount,
         null::text as outcome, null::text as status_from, null::text as status_to
    from public.production_logs p where not p.is_voided
  union all
  select 'time', t.work_date, t.agency_id, t.organization_id, null, t.division_id, null, t.employee_id, t.client_id, null,
         null, null, t.duration_minutes, null, null, null, null
    from public.time_entries t where t.ended_at is not null
  union all
  select 'status_change', a.created_at::date, a.agency_id, a.organization_id, null, 'creditops', null, a.actor_id, (a.entity_id)::uuid, null,
         null, null, null, null, null, a.previous_value, a.new_value
    from public.activity_events a
   where a.entity_type = 'fulfillment_client' and a.action = 'Status changed'
     and a.entity_id ~ '^[0-9a-f-]{36}$'
  union all
  select 'letter', l.created_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
         null, null, null, null, 'built', null, null
    from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id
  union all
  select 'letter', l.mailed_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
         null, null, null, null, 'mailed', null, null
    from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id where l.mailed_at is not null
  union all
  select 'letter', l.responded_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
         null, null, null, null, 'responded', null, null
    from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id where l.responded_at is not null
  union all
  select 'manual_outcome', o.outcome_date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', o.recorded_by, o.client_id, null,
         o.bureau, v.qty, null, null, v.kind, null, null
    from public.client_round_outcomes o join public.fulfillment_clients c on c.id = o.client_id
    cross join lateral (values ('deleted', o.deleted::numeric), ('updated', o.updated::numeric), ('verified', o.verified::numeric), ('disputed', o.items_disputed::numeric)) as v(kind, qty)
  union all
  select 'submission', coalesce(d.submitted_at, d.created_at)::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Submissions', f.assigned_agent_id, null, d.file_id,
         d.lender, null, null, d.amount, d.status::text, null, null
    from public.funding_deals d join public.funding_files f on f.id = d.file_id join public.funding_clients fc on fc.id = f.client_id
   where d.status <> 'Draft'
  union all
  select 'funded', fd.funded_at::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Funded Deals', fd.confirmed_by, null, fd.file_id,
         fd.lender_name, null, null, fd.gross_funded, 'funded', null, null
    from public.funded_deals fd join public.funding_files f on f.id = fd.file_id join public.funding_clients fc on fc.id = f.client_id;

-- Pivot -------------------------------------------------------------------------
/** Equality filters from a KPI's match jsonb, restricted to fact columns; anything else is ignored, never interpolated. */
create or replace function public.kpi_match_sql(p_match jsonb)
returns text language sql immutable as $$
  select coalesce(string_agg(format(' and %I = %L', key, value), ''), '')
    from jsonb_each_text(coalesce(p_match, '{}'::jsonb))
   where key in ('outcome', 'unit', 'department', 'service', 'status_from', 'status_to')
$$;

/**
 * report_pivot(rows, kpis, filters, from, to): rows ∈ employee | department | organization |
 * client | month | service; kpis = catalogue keys; filters = {"organization_id","service",
 * "department","employee_id"}. Returns one jsonb per row: {"row": <label/id>, "<kpi>": value}.
 * SECURITY INVOKER: the facts view is already scoped by the caller's RLS. An organization
 * caller never receives a bes_internal KPI.
 */
create or replace function public.report_pivot(p_rows text, p_kpis text[], p_filters jsonb default '{}'::jsonb, p_from date default (current_date - 180), p_to date default current_date)
returns setof jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_dim text; v_cols text := ''; k record; v_sql text; v_where text := '';
begin
  v_dim := case p_rows
    when 'employee' then 'employee_id::text' when 'department' then 'coalesce(department, ''—'')' when 'organization' then 'organization_id::text'
    when 'client' then 'client_id::text' when 'month' then 'to_char(fact_date, ''YYYY-MM'')' when 'service' then 'service'
    else null end;
  if v_dim is null then raise exception 'Unknown row dimension %', p_rows using errcode = '22023'; end if;
  for k in select * from public.kpi_definitions where key = any(p_kpis) order by sort loop
    if k.bes_internal and not public.is_agency_staff() then continue; end if;
    v_cols := v_cols || format(', %s as %I',
      case k.aggregation
        when 'count'                 then format('count(case when source = %L%s then 1 end)', k.source, public.kpi_match_sql(k.match))
        when 'count_distinct_client' then format('count(distinct case when source = %L%s then client_id end)', k.source, public.kpi_match_sql(k.match))
        when 'sum_quantity'          then format('coalesce(sum(case when source = %L%s then quantity end), 0)', k.source, public.kpi_match_sql(k.match))
        when 'sum_minutes'           then format('coalesce(sum(case when source = %L%s then minutes end), 0)', k.source, public.kpi_match_sql(k.match))
        when 'sum_amount'            then format('coalesce(sum(case when source = %L%s then amount end), 0)', k.source, public.kpi_match_sql(k.match))
      end, k.key);
  end loop;
  if v_cols = '' then return; end if;
  if p_filters ? 'organization_id' then v_where := v_where || format(' and organization_id = %L', p_filters->>'organization_id'); end if;
  if p_filters ? 'service'         then v_where := v_where || format(' and service = %L', p_filters->>'service'); end if;
  if p_filters ? 'department'      then v_where := v_where || format(' and department = %L', p_filters->>'department'); end if;
  if p_filters ? 'employee_id'     then v_where := v_where || format(' and employee_id = %L', p_filters->>'employee_id'); end if;
  v_sql := format('select to_jsonb(x) from (select %s as row %s from public.report_facts where fact_date between %L and %L %s group by 1 order by 1) x', v_dim, v_cols, p_from, p_to, v_where);
  return query execute v_sql;
end $$;

-- Indexes the pivot's date window needs -------------------------------------------
create index if not exists production_logs_work_date_idx on public.production_logs (work_date);
create index if not exists time_entries_work_date_idx on public.time_entries (work_date);
create index if not exists dispute_letters_mailed_idx on public.dispute_letters (mailed_at);
create index if not exists dispute_letters_responded_idx on public.dispute_letters (responded_at);
create index if not exists funded_deals_funded_at_idx on public.funded_deals (funded_at);
create index if not exists funding_deals_submitted_idx on public.funding_deals (submitted_at);
create index if not exists activity_events_status_change_idx on public.activity_events (entity_type, action, created_at);

-- RLS ---------------------------------------------------------------------------
alter table public.kpi_definitions enable row level security;
alter table public.organization_kpi_settings enable row level security;
alter table public.client_round_outcomes enable row level security;
revoke all on public.kpi_definitions, public.organization_kpi_settings, public.client_round_outcomes, public.report_facts from public, anon;
grant select on public.kpi_definitions, public.report_facts to authenticated;
grant select, insert, update, delete on public.organization_kpi_settings to authenticated;
grant select, insert, update on public.client_round_outcomes to authenticated;
create policy kpi_definitions_select on public.kpi_definitions for select to authenticated using (not bes_internal or public.is_agency_staff());
create policy org_kpi_settings_select on public.organization_kpi_settings for select to authenticated using (public.is_org_member(organization_id) or public.is_agency_staff());
create policy org_kpi_settings_write on public.organization_kpi_settings for all to authenticated
  using (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)))
  with check (public.is_org_owner_admin(organization_id) or public.is_manager_of(public.org_agency(organization_id)));
create policy client_round_outcomes_select on public.client_round_outcomes for select to authenticated using (public.credit_client_visible(client_id));
create policy client_round_outcomes_insert on public.client_round_outcomes for insert to authenticated with check (public.credit_client_writable(client_id) and recorded_by = auth.uid());
create policy client_round_outcomes_update on public.client_round_outcomes for update to authenticated using (public.credit_client_writable(client_id)) with check (public.credit_client_writable(client_id));
revoke all on function public.report_pivot(text, text[], jsonb, date, date) from public, anon;
grant execute on function public.report_pivot(text, text[], jsonb, date, date) to authenticated;
