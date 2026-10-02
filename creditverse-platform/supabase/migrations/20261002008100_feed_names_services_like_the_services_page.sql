-- Same-day follow-up to 20261002008000, from reading a real partner's feed:
--
-- 1. Service names match the Services page ("Sales & Marketing", "BES CRM"),
--    not the raw module key.
-- 2. One change, one line. A CreditOps status change that also moves the
--    round writes two activity entries at the same instant (all 81 round
--    entries in the last 30 days were paired); the feed said both. A round
--    entry now shows only when no status entry was written with it.
-- 3. p_kind narrows the feed to one group — clients · projects · billing ·
--    account — so a partner with hundreds of client updates can still find
--    their invoices. Filtered in the database, each branch skipped outright
--    when another group is asked for; never filtered in the browser over a
--    truncated list.

drop function if exists public.my_partner_feed(integer);

create or replace function public.my_partner_feed(p_limit integer default 40, p_kind text default null)
returns table(kind text, happened_at timestamptz, title text, detail text, href text)
language sql stable security definer set search_path = public as $$
  with me as (select public.partner_group_of_user() as gid, public.partner_billing_group_of_user() as bid),
  lim as (select greatest(1, least(coalesce(p_limit, 40), 100)) as n),
  client_events as (
    select case when e.field in ('status', 'round') then 'client_status' else 'client_added' end as kind,
           e.created_at as happened_at,
           case when e.field = 'status' then c.name || ' moved to ' || coalesce(e.new_value, 'a new status')
                when e.field = 'round'  then c.name || ' is now on ' || coalesce(e.new_value, 'a new round')
                else c.name || ' was added to your account' end as title,
           null::text as detail,
           '/partner/clients/' || c.public_id as href
      from public.activity_events e
      join public.fulfillment_clients c on c.id = public.try_uuid(e.entity_id), me
     where e.entity_type = 'fulfillment_client'
       and e.visibility = 'shared_with_partner'
       and (e.field in ('status', 'round') or e.action = 'Client added')
       and c.outsourcing_group_id = me.gid
       and c.archived_at is null
       and (p_kind is null or p_kind = 'clients')
       and not (e.field = 'round' and exists (
             select 1 from public.activity_events s
              where s.entity_type = e.entity_type and s.entity_id = e.entity_id
                and s.field = 'status' and s.created_at = e.created_at))
     order by e.created_at desc
     limit (select n from lim)
  ),
  projects as (
    select 'project'::text, p.went_live_at, p.name || ' is live', null::text, '/partner/services'
      from public.crm_projects p, me
     where (p_kind is null or p_kind = 'projects') and p.partner_group_id = me.gid and p.archived_at is null and p.went_live_at is not null
    union all
    select 'project', p.completed_at, p.name || ' is complete', null, '/partner/services'
      from public.crm_projects p, me
     where (p_kind is null or p_kind = 'projects') and p.partner_group_id = me.gid and p.archived_at is null and p.completed_at is not null
    union all
    select 'project', r.satisfied_at, 'BES received: ' || r.label, p.name, '/partner/services'
      from public.crm_client_requirements r
      join public.crm_projects p on p.id = r.project_id, me
     where (p_kind is null or p_kind = 'projects') and p.partner_group_id = me.gid and p.archived_at is null and r.satisfied_at is not null
  ),
  milestones as (
    select case when m.link_url is not null then 'deliverable' else 'milestone' end,
           m.completed_at,
           case when m.link_url is not null then 'Delivered: ' || m.label else 'Milestone reached: ' || m.label end,
           p.name,
           coalesce(m.link_url, '/partner/services')
      from public.crm_milestones m
      join public.crm_projects p on p.id = m.project_id, me
     where (p_kind is null or p_kind = 'projects') and p.partner_group_id = me.gid and p.archived_at is null
       and m.client_visible and m.completed_at is not null
  ),
  billing as (
    select 'billing'::text, coalesce(i.sent_at, i.issue_date::timestamptz),
           'Invoice ' || i.invoice_number || ' issued',
           to_char(i.total_cents / 100.0, 'FM999,999,990.00') || ' ' || i.currency || ' · due ' || to_char(i.due_date, 'FMMon FMDD, YYYY'),
           '/partner/billing'
      from public.partner_invoices i, me
     where (p_kind is null or p_kind = 'billing') and i.group_id = me.bid and i.status not in ('draft', 'void', 'cancelled', 'scheduled')
    union all
    select 'billing', p.paid_on::timestamptz,
           'Payment received',
           to_char(p.amount_cents / 100.0, 'FM999,999,990.00') || ' ' || p.currency,
           '/partner/billing'
      from public.partner_payments p, me
     where (p_kind is null or p_kind = 'billing') and p.group_id = me.bid and p.status in ('succeeded', 'refunded')
  ),
  account as (
    select 'account'::text, e.effective_from::timestamptz,
           (case e.service::text when 'creditops' then 'CreditOps' when 'fundingops' then 'FundingOps' when 'bes_crm' then 'BES CRM'
                 when 'talentops' then 'TalentOps' when 'sales_marketing' then 'Sales & Marketing'
                 else initcap(replace(e.service::text, '_', ' ')) end) || ' service started', null::text, '/partner/services'
      from public.fulfillment_engagements e, me
     where (p_kind is null or p_kind = 'account') and e.outsourcing_group_id = me.gid and e.effective_from is not null and e.effective_from <= current_date
    union all
    select 'account', e.effective_to::timestamptz,
           (case e.service::text when 'creditops' then 'CreditOps' when 'fundingops' then 'FundingOps' when 'bes_crm' then 'BES CRM'
                 when 'talentops' then 'TalentOps' when 'sales_marketing' then 'Sales & Marketing'
                 else initcap(replace(e.service::text, '_', ' ')) end) || ' service ended', null, '/partner/services'
      from public.fulfillment_engagements e, me
     where (p_kind is null or p_kind = 'account') and e.outsourcing_group_id = me.gid and e.effective_to is not null and e.effective_to <= current_date
    union all
    select 'account', s.sent_at, 'Agreement sent for signature: ' || s.title, null, '/partner/agreements'
      from public.signature_requests s, me
     where (p_kind is null or p_kind = 'account') and s.outsourcing_group_id = me.gid and s.sent_at is not null
    union all
    select 'account', s.signed_at, 'Agreement signed: ' || s.title, null, '/partner/agreements'
      from public.signature_requests s, me
     where (p_kind is null or p_kind = 'account') and s.outsourcing_group_id = me.gid and s.signed_at is not null
    union all
    select 'account', f.shared_at, 'BES shared a file: ' || f.name, null, '/partner/files'
      from public.files f, me
     where (p_kind is null or p_kind = 'account') and f.entity_type = 'partner' and f.entity_id = me.gid::text and f.shared_with_partner
       and f.shared_at is not null
       and not exists (select 1 from public.partner_contacts pc where pc.group_id = me.gid and pc.user_id = f.uploaded_by)
  ),
  everything as (
    select * from client_events
    union all select * from projects
    union all select * from milestones
    union all select * from billing
    union all select * from account
  )
  select kind, happened_at, title, detail, href
    from everything
   where happened_at is not null and happened_at <= now()
   order by happened_at desc
   limit (select n from lim)
$$;

revoke execute on function public.my_partner_feed(integer, text) from anon, public;
grant execute on function public.my_partner_feed(integer, text) to authenticated;
