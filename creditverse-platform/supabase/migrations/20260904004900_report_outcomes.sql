-- =============================================================================
-- 0071 — Report-derived outcomes (ARCHITECTURE_PROPOSAL_REPORTING.md step 2)
--
-- Consecutive imports of the same client's credit report, compared by
-- account_ref: an item present in the earlier import and absent in the later
-- one is a DELETION observed on the later import's date; the same item with a
-- different status or balance is an UPDATE. These are observations of the
-- consumer-facing display (never a statement about the furnisher's record) and
-- carry provenance `engine`; manual outcomes (0069) carry `manual`. Both feed
-- report_facts; the pivot and the KPI catalogue tell them apart.
-- =============================================================================

create or replace view public.report_item_changes
with (security_invoker = true) as
with ordered as (
  select r.id as report_id, r.fulfillment_client_id as client_id, r.pulled_at,
         lag(r.id) over (partition by r.fulfillment_client_id order by r.pulled_at, r.created_at) as prev_report_id
    from public.credit_reports r
   where r.fulfillment_client_id is not null
),
pairs as (select * from ordered where prev_report_id is not null)
select p.client_id, p.report_id, p.prev_report_id, p.pulled_at::date as observed_on,
       prev.account_ref, prev.kind, prev.name,
       case when cur.id is null then 'deleted'
            when cur.status <> prev.status or coalesce(cur.balance_cents, -1) <> coalesce(prev.balance_cents, -1) then 'updated'
            else 'unchanged' end as change,
       prev.status as previous_status, cur.status as current_status,
       prev.balance_cents as previous_balance_cents, cur.balance_cents as current_balance_cents,
       prev.bureaus
  from pairs p
  join public.report_items prev on prev.report_id = p.prev_report_id and prev.kind = 'Account'
  left join public.report_items cur on cur.report_id = p.report_id and cur.account_ref = prev.account_ref;
revoke all on public.report_item_changes from public, anon;
grant select on public.report_item_changes to authenticated;

-- Facts: one row per deleted / updated account per bureau-set, provenance engine
create or replace view public.report_facts
with (security_invoker = true) as
  select * from (
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
     where a.entity_type = 'fulfillment_client' and a.action = 'Status changed' and a.entity_id ~ '^[0-9a-f-]{36}$'
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
    select 'report_outcome', ch.observed_on, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', null, ch.client_id, null,
           array_to_string(ch.bureaus, ','), 1, null, null, ch.change, ch.previous_status, ch.current_status
      from public.report_item_changes ch join public.fulfillment_clients c on c.id = ch.client_id
     where ch.change in ('deleted', 'updated')
    union all
    select 'submission', coalesce(d.submitted_at, d.created_at)::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Submissions', f.assigned_agent_id, null, d.file_id,
           d.lender, null, null, d.amount, d.status::text, null, null
      from public.funding_deals d join public.funding_files f on f.id = d.file_id join public.funding_clients fc on fc.id = f.client_id
     where d.status <> 'Draft'
    union all
    select 'funded', fd.funded_at::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Funded Deals', fd.confirmed_by, null, fd.file_id,
           fd.lender_name, null, null, fd.gross_funded, 'funded', null, null
      from public.funded_deals fd join public.funding_files f on f.id = fd.file_id join public.funding_clients fc on fc.id = f.client_id
  ) facts;

alter table public.kpi_definitions drop constraint if exists kpi_definitions_source_check;
alter table public.kpi_definitions add constraint kpi_definitions_source_check check (source in ('production', 'time', 'status_change', 'letter', 'submission', 'funded', 'manual_outcome', 'report_outcome'));

insert into public.kpi_definitions (key, label, description, service, source, aggregation, match, bes_internal, sort) values
  ('outcomes.deleted_engine', 'Items deleted (from reports)', 'Accounts present in one import and gone in the next — observed on the later import', 'creditops', 'report_outcome', 'count', '{"outcome":"deleted"}', false, 28),
  ('outcomes.updated_engine', 'Items updated (from reports)', 'Accounts whose status or balance changed between imports',                          'creditops', 'report_outcome', 'count', '{"outcome":"updated"}', false, 29)
on conflict (key) do nothing;
