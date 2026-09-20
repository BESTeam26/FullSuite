-- Each division's departments are its own, and the report says so.
--
-- Dee, 2026-09-20: "separate each department based in the division. So
-- CreditOps will have its own support department and team while BES CRM and
-- FundingOps and TalentOps have the same logic."
--
-- They already are separate in the structure — `departments` carries a
-- `division_id`. The REPORT was the part that lost it: `report_facts` records
-- a department NAME, so "Support" from CreditOps and "Support" from
-- FundingOps added into one row. That was not hypothetical. Two CreditOps
-- production logs recorded against "Support" were matching FundingOps'
-- Support department, because a name is all the report had to match on.
--
-- Two fixes:
--
--   1. Time now reports its department. It has had one since 20260920007000
--      and the view was still emitting NULL, which is why every department
--      showed zero minutes worked.
--   2. `report_facts_scoped` resolves each fact to ONE department row, found
--      inside its own division and by key first, then name. A department that
--      cannot be resolved keeps its raw label rather than disappearing.
--
-- Generated — see supabase/scripts/gen-report-knows-the-division.mjs.

create or replace view public.report_facts as
 SELECT source,
    fact_date,
    agency_id,
    organization_id,
    outsourcing_group_id,
    service,
    department,
    employee_id,
    client_id,
    funding_file_id,
    unit,
    quantity,
    minutes,
    amount,
    outcome,
    status_from,
    status_to
   FROM ( SELECT 'production'::text AS source,
            p.work_date AS fact_date,
            p.agency_id,
            p.organization_id,
            p.outsourcing_group_id,
            p.division_id AS service,
            p.department::text AS department,
            p.employee_id,
            p.client_id,
            NULL::uuid AS funding_file_id,
            p.production_unit_type AS unit,
            p.production_unit_quantity::numeric AS quantity,
            NULL::integer AS minutes,
            NULL::numeric AS amount,
            NULL::text AS outcome,
            NULL::text AS status_from,
            NULL::text AS status_to
           FROM production_logs p
          WHERE NOT p.is_voided
        UNION ALL
         SELECT 'time'::text,
            t.work_date,
            t.agency_id,
            t.organization_id,
            NULL::uuid,
            t.division_id,
            (select dep.name from public.departments dep where dep.id = t.department_id),
            t.employee_id,
            t.client_id,
            NULL::uuid,
            NULL::text,
            NULL::numeric,
            t.duration_minutes,
            NULL::numeric,
            NULL::text,
            NULL::text,
            NULL::text
           FROM time_entries t
          WHERE t.ended_at IS NOT NULL
        UNION ALL
         SELECT 'status_change'::text,
            a.created_at::date AS created_at,
            a.agency_id,
            a.organization_id,
            NULL::uuid,
            'creditops'::text,
            NULL::text,
            a.actor_id,
            a.entity_id::uuid AS entity_id,
            NULL::uuid,
            NULL::text,
            NULL::numeric,
            NULL::integer,
            NULL::numeric,
            NULL::text,
            a.previous_value,
            a.new_value
           FROM activity_events a
          WHERE a.entity_type = 'fulfillment_client'::text AND a.action = 'Status changed'::text AND a.entity_id ~ '^[0-9a-f-]{36}$'::text
        UNION ALL
         SELECT 'letter'::text,
            l.created_at::date AS created_at,
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            l.created_by,
            l.client_id,
            NULL::uuid,
            NULL::text,
            NULL::numeric,
            NULL::integer,
            NULL::numeric,
            'built'::text,
            NULL::text,
            NULL::text
           FROM dispute_letters l
             JOIN fulfillment_clients c ON c.id = l.client_id
        UNION ALL
         SELECT 'letter'::text,
            l.mailed_at::date AS mailed_at,
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            l.created_by,
            l.client_id,
            NULL::uuid,
            NULL::text,
            NULL::numeric,
            NULL::integer,
            NULL::numeric,
            'mailed'::text,
            NULL::text,
            NULL::text
           FROM dispute_letters l
             JOIN fulfillment_clients c ON c.id = l.client_id
          WHERE l.mailed_at IS NOT NULL
        UNION ALL
         SELECT 'letter'::text,
            l.responded_at::date AS responded_at,
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            l.created_by,
            l.client_id,
            NULL::uuid,
            NULL::text,
            NULL::numeric,
            NULL::integer,
            NULL::numeric,
            'responded'::text,
            NULL::text,
            NULL::text
           FROM dispute_letters l
             JOIN fulfillment_clients c ON c.id = l.client_id
          WHERE l.responded_at IS NOT NULL
        UNION ALL
         SELECT 'manual_outcome'::text,
            o.outcome_date,
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            o.recorded_by,
            o.client_id,
            NULL::uuid,
            o.bureau,
            v.qty,
            NULL::integer,
            NULL::numeric,
            v.kind,
            NULL::text,
            NULL::text
           FROM client_round_outcomes o
             JOIN fulfillment_clients c ON c.id = o.client_id
             CROSS JOIN LATERAL ( VALUES ('deleted'::text,o.deleted::numeric), ('updated'::text,o.updated::numeric), ('verified'::text,o.verified::numeric), ('disputed'::text,o.items_disputed::numeric)) v(kind, qty)
        UNION ALL
         SELECT 'report_outcome'::text,
            ch.observed_on,
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            NULL::uuid,
            ch.client_id,
            NULL::uuid,
            array_to_string(ch.bureaus, ','::text) AS array_to_string,
            1,
            NULL::integer,
            NULL::numeric,
            ch.change,
            ch.previous_status,
            ch.current_status
           FROM report_item_changes ch
             JOIN fulfillment_clients c ON c.id = ch.client_id
          WHERE ch.change = ANY (ARRAY['no_longer_observed'::text, 'updated'::text, 'newly_reported'::text, 'unable_to_compare'::text, 'ambiguous_match'::text])
        UNION ALL
         SELECT 'reviewed_outcome'::text,
            COALESCE(o.reviewed_at, o.created_at)::date AS "coalesce",
            c.agency_id,
            c.organization_id,
            c.outsourcing_group_id,
            'creditops'::text,
            'Dispute'::text,
            COALESCE(o.reviewed_by, o.created_by) AS "coalesce",
            o.client_id,
            NULL::uuid,
            o.bureau,
            1,
            NULL::integer,
            NULL::numeric,
            o.outcome::text AS outcome,
            o.previous_value,
            o.current_value
           FROM dispute_item_outcomes o
             JOIN fulfillment_clients c ON c.id = o.client_id
        UNION ALL
         SELECT 'submission'::text,
            COALESCE(d.submitted_at, d.created_at)::date AS "coalesce",
            fc.agency_id,
            fc.organization_id,
            fc.outsourcing_group_id,
            'fundingops'::text,
            'Submissions'::text,
            f.assigned_agent_id,
            NULL::uuid,
            d.file_id,
            d.lender,
            NULL::numeric,
            NULL::integer,
            d.amount,
            d.status::text AS status,
            NULL::text,
            NULL::text
           FROM funding_deals d
             JOIN funding_files f ON f.id = d.file_id
             JOIN funding_clients fc ON fc.id = f.client_id
          WHERE d.status <> 'Draft'::funding_deal_status
        UNION ALL
         SELECT 'funded'::text,
            fd.funded_at::date AS funded_at,
            fc.agency_id,
            fc.organization_id,
            fc.outsourcing_group_id,
            'fundingops'::text,
            'Funded Deals'::text,
            fd.confirmed_by,
            NULL::uuid,
            fd.file_id,
            fd.lender_name,
            NULL::numeric,
            NULL::integer,
            fd.gross_funded,
            'funded'::text,
            NULL::text,
            NULL::text
           FROM funded_deals fd
             JOIN funding_files f ON f.id = fd.file_id
             JOIN funding_clients fc ON fc.id = f.client_id) facts;;

/**
 * Every fact, with its division named and its department resolved.
 *
 * The department is looked up INSIDE the fact's own division, so two
 * departments called Support stay two departments. Key first because the
 * production enum spells 'Support' where the structure names it 'Client
 * Success'; name second because a department added later may match that way
 * and nothing else.
 */
create or replace view public.report_facts_scoped as
  select f.*,
         dv.id                                   as division_id,
         coalesce(dv.name, f.service, '—')       as division,
         dep.id                                  as department_id,
         /* Labelled with the division, because "Support" alone is the very
            ambiguity this view exists to remove. */
         case
           when dep.id is not null then dep.name || ' · ' || dv.name
           when f.department is not null then f.department
           else '—'
         end                                     as department_scoped
    from public.report_facts f
    left join public.divisions dv
      on dv.archived_at is null and dv.service::text = f.service
    left join lateral (
      select d.id, d.name from public.departments d
       where d.archived_at is null
         and d.division_id = dv.id
         and f.department is not null
         and (lower(d.key) = lower(f.department) or lower(d.name) = lower(f.department))
       order by (lower(d.key) = lower(f.department)) desc
       limit 1
    ) dep on true;

comment on view public.report_facts_scoped is
  'report_facts with the division named and the department resolved WITHIN that division, so two departments of the same name are never added together.';
revoke all on public.report_facts_scoped from public, anon;
grant select on public.report_facts_scoped to authenticated;
