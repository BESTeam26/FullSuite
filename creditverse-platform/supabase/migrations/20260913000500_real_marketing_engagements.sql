-- =============================================================================
-- The Sales & Marketing engagements that ALREADY EXIST, and no others.
--
-- Dee, 2026-09-13: "Do not add Marketing to every Partner just to populate the
-- new module. Inspect the existing Partner/service records and identify which
-- Partners already have real Marketing/Social Media/Sales support
-- relationships with BES."
--
-- ── WHAT THE RECORDS ACTUALLY SAY ───────────────────────────────────────────
--
-- `partner_services` is the catalogue of what a partner bought;
-- `fulfillment_engagements` is what BES is contracted to fulfil, and it is the
-- engagement — never the catalogue row — that authorizes anything (rule 16).
--
-- Inspected on 2026-09-13, across all 26 live partners: exactly ONE has an
-- active service whose type maps to `sales_marketing` — Business Made Fair,
-- `SOCIAL_MEDIA`, active, with Rowell Christian Pena recorded as the person
-- doing it. Nobody else has any marketing service type at all, active or
-- otherwise. So this migration creates exactly one engagement, and it creates
-- it by DERIVING from the catalogue rather than naming BMF in an insert —
-- which is why it cannot quietly invent a relationship for anybody else.
--
-- Not touched: BMF's `OPERATIONS_MANAGEMENT`, which is Staffing and has no
-- module assigned. It stays in `service_types_needing_module` for Dee to
-- decide, because filing a management retainer under Marketing would put a
-- partner in a module nobody sold them.
--
-- No pricing and no package: `commitment` stays null. Dee: "Do not invent
-- pricing or public packages."
--
-- The workspace provisions itself — `fulfillment_engagements_marketing_
-- workspace` fires on this insert — so BMF appears in the Sales & Marketing
-- partner list without anybody adding them to a list.
-- =============================================================================

insert into public.fulfillment_engagements
  (agency_id, outsourcing_group_id, service, status, effective_from, authorized_team_id)
select distinct
       g.agency_id,
       g.id,
       'sales_marketing'::public.fulfillment_service,
       'active'::public.engagement_status,
       (now() at time zone 'utc')::date,
       (select t.id from public.teams t
         where t.agency_id = g.agency_id and t.name = 'Sales & Marketing Team'
           and t.archived_at is null)
  from public.outsourcing_groups g
  join public.partner_services ps on ps.group_id = g.id and ps.status = 'active'
  join public.partner_service_types st
    on st.code = ps.service_type and st.module = 'sales_marketing'
 where g.archived_at is null
   and not g.is_fixture
   and g.lifecycle not in ('suspended', 'archived')
   /* Idempotent: re-running must not create a second engagement, and the
      unique index on (partner, service) would refuse it anyway — better to
      say so here than to rely on a constraint to be the logic. */
   and not exists (
     select 1 from public.fulfillment_engagements e
      where e.outsourcing_group_id = g.id
        and e.service = 'sales_marketing'
        and e.effective_to is null);

/* Say what happened, in the migration log, rather than assuming it did. */
do $$
declare n int; names text;
begin
  select count(*), string_agg(g.name, ', ' order by g.name)
    into n, names
    from public.fulfillment_engagements e
    join public.outsourcing_groups g on g.id = e.outsourcing_group_id
   where e.service = 'sales_marketing'
     and public.engagement_is_live(e.status, e.effective_from, e.effective_to);
  raise notice 'Live Sales & Marketing partners: % (%)', n, coalesce(names, 'none');
end $$;
