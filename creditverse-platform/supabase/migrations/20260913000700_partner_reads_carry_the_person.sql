-- =============================================================================
-- A Partner is presented as `Business · Person`, so the view has to carry both.
--
-- Dee, 2026-09-13: "some agents know Jesse but some agents know the company
-- name. This way we're building a memory about the partner and the businesses
-- we're supporting."
--
-- The person is the PRIMARY CONTACT — the canonical `partner_contacts` row —
-- not `outsourcing_groups.partner_name`, which for most imported partners
-- holds the company name a second time. Both are returned; the display rule
-- prefers the contact and drops a person whose name is already the company's.
-- =============================================================================

create or replace view public.marketing_partners as
  /* Appended, not inserted: `create or replace view` may add a column at the
     end and may not rename one, so column ORDER here is a compatibility
     contract with every view already built on top of it. */
  select distinct g.id, g.name, g.partner_name, g.lifecycle,
         (select w.id from public.workspaces w
           where w.partner_group_id = g.id and w.module = 'sales_marketing'
             and w.archived_at is null
           limit 1) as workspace_id,
         (select c.full_name from public.partner_contacts c
           where c.group_id = g.id and c.is_primary
           order by c.created_at
           limit 1) as primary_contact_name
    from public.outsourcing_groups g
    join public.fulfillment_engagements e on e.outsourcing_group_id = g.id
   where e.service = 'sales_marketing'
     and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
     and g.archived_at is null
     and not g.is_fixture;

alter view public.marketing_partners set (security_invoker = true);
grant select on public.marketing_partners to authenticated;

/**
 * Marketing work already carries `partner_name` (the business). It now carries
 * the person too, so a global task list can read `Business · Person` without a
 * second query per row.
 */
create or replace view public.marketing_work as
  select
    wi.id,
    wi.workspace_id,
    w.name              as workspace_name,
    w.partner_group_id,
    g.name              as partner_name,
    wi.title,
    wi.description,
    wi.priority,
    wi.assigned_to,
    coalesce(nullif(btrim(pr.full_name), ''), pr.email) as assignee_name,
    wi.team_id,
    wi.due_at,
    wi.completed_at,
    wi.created_at,
    wi.updated_at,
    wi.status_id,
    s.key               as status_key,
    s.label             as status_label,
    s.colour            as status_colour,
    s.position          as status_position,
    coalesce(s.is_terminal, false) as is_terminal,
    wi.item_type_id,
    t.key               as item_type_key,
    t.label             as item_type_label,
    wi.campaign_id,
    c.name              as campaign_name,
    fv.publish_on,
    fv.channel,
    fv.content_type,
    /* Appended for the same reason as above. */
    (select c.full_name from public.partner_contacts c
      where c.group_id = g.id and c.is_primary
      order by c.created_at limit 1) as partner_contact_name
  from public.work_items wi
  join public.workspaces w
    on w.id = wi.workspace_id and w.module = 'sales_marketing' and w.archived_at is null
  left join public.outsourcing_groups g on g.id = w.partner_group_id
  left join public.workspace_statuses  s on s.id = wi.status_id
  left join public.workspace_item_types t on t.id = wi.item_type_id
  left join public.campaigns           c on c.id = wi.campaign_id
  left join public.profiles           pr on pr.id = wi.assigned_to
  left join lateral (
    select
      max(case when f.key = 'publish_at'   then v.value #>> '{}' end) as publish_on,
      max(case when f.key = 'channel'      then v.value #>> '{}' end) as channel,
      max(case when f.key = 'content_type' then v.value #>> '{}' end) as content_type
    from public.work_item_field_values v
    join public.workspace_fields f on f.id = v.field_id
   where v.work_item_id = wi.id
  ) fv on true
 where wi.archived_at is null;

alter view public.marketing_work set (security_invoker = true);
grant select on public.marketing_work to authenticated;
