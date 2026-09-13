-- =============================================================================
-- Everything BES is doing for a partner, across every module.
--
-- Dee, 2026-09-13: "Replace the CRM-only projection with a true cross-module
-- Partner view… CreditOps, BES CRM, FundingOps, TalentOps, Sales & Marketing."
--
-- The portal used to show BES CRM projects and nothing else, so a partner
-- buying CreditOps fulfilment and marketing saw an empty page.
--
-- ── THE ENGAGEMENT IS THE SPINE ─────────────────────────────────────────────
--
-- One row per live `fulfillment_engagements` record — the same table that
-- authorizes the work in the first place (rule 16). A module cannot appear
-- here without being authorized, and cannot be authorized without appearing
-- here. Each row is then enriched with whatever that module can honestly say
-- about progress.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
--
-- No work-item noise, no internal assignee, no health reason, no rates. Dee:
-- "Do not expose internal work-item noise." What a partner gets is the state
-- of the service, a milestone when the module has one, and a count.
-- =============================================================================

create or replace function public.my_partner_services()
returns table(
  engagement_id uuid,
  module text,
  module_label text,
  service_label text,
  status text,
  started_on date,
  ends_on date,
  milestone text,
  detail text,
  open_items integer,
  /** Where the portal can go for more, when that module has a page. */
  link_kind text,
  link_id text
)
language sql stable security definer set search_path = public as $function$
  with me as (select public.partner_billing_group_of_user() as gid),
  live as (
    select e.*
      from public.fulfillment_engagements e, me
     where e.outsourcing_group_id = me.gid
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
  )
  select
    e.id,
    e.service::text,
    case e.service
      when 'creditops'       then 'CreditOps'
      when 'fundingops'      then 'FundingOps'
      when 'bes_crm'         then 'BES CRM'
      when 'talentops'       then 'TalentOps'
      when 'sales_marketing' then 'Sales & Marketing'
      else initcap(replace(e.service::text, '_', ' '))
    end,
    /* The service they actually bought, when the catalogue knows. Falls back
       to the module's own name rather than inventing a product. */
    coalesce(
      (select string_agg(distinct coalesce(st.label, ps.service_type), ', ')
         from public.partner_services ps
         left join public.partner_service_types st on st.code = ps.service_type
        where ps.group_id = e.outsourcing_group_id
          and ps.status = 'active'
          and st.module = e.service),
      case e.service
        when 'creditops' then 'Fulfilment'
        when 'bes_crm' then 'Build'
        else 'Service' end),
    initcap(e.status::text),
    e.effective_from,
    e.effective_to,
    /* Each module says what it can honestly say, and nothing more. */
    case e.service
      when 'creditops' then (
        select count(*)::text || ' ' || case when count(*) = 1 then 'client' else 'clients' end || ' in progress'
          from public.fulfillment_clients c
         where c.outsourcing_group_id = e.outsourcing_group_id
           and coalesce(c.lifecycle, 'active') = 'active' and not c.is_fixture)
      when 'bes_crm' then (
        select p.name from public.crm_projects p
         where p.partner_group_id = e.outsourcing_group_id and p.archived_at is null
         order by p.created_at desc limit 1)
      when 'sales_marketing' then (
        select count(*)::text || ' scheduled this month'
          from public.marketing_work mw
          join public.workspaces w on w.id = mw.workspace_id
         where w.partner_group_id = e.outsourcing_group_id
           and mw.publish_on is not null
           and mw.publish_on >= to_char(date_trunc('month', current_date), 'YYYY-MM-DD')
           and mw.publish_on <= to_char((date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'YYYY-MM-DD'))
      else null
    end,
    null::text,
    case e.service
      when 'creditops' then (
        select count(*)::int from public.fulfillment_clients c
         where c.outsourcing_group_id = e.outsourcing_group_id
           and coalesce(c.lifecycle, 'active') = 'active' and not c.is_fixture)
      when 'sales_marketing' then (
        select count(*)::int from public.marketing_work mw
          join public.workspaces w on w.id = mw.workspace_id
         where w.partner_group_id = e.outsourcing_group_id and not mw.is_terminal)
      else 0
    end,
    /* Only where the portal genuinely has somewhere to send them. */
    case e.service when 'creditops' then 'clients' else null end,
    null::text
  from live e
  order by e.service::text
$function$;
revoke execute on function public.my_partner_services() from public, anon;
grant execute on function public.my_partner_services() to authenticated;
