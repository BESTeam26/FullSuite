-- =============================================================================
-- ClickUp → BES: PARTNER import (Dee's "proceed", 2026-09-09)
--
-- Imports the partner roster from the ClickUp Partners Database (list
-- 901812869358, 25 partners) plus the one folder-only partner the survey
-- found (Blue Chip Equity / Kevin Hernandez — docs/MIGRATION_READINESS.md).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   • No client rows. `fulfillment_clients.email` is NOT NULL and unique per
--     partner, and client emails live only in per-task ClickUp custom fields
--     whose descriptions also carry plaintext credentials — not safely
--     fetchable in bulk. Client import is a separate, gated step.
--   • No credentials. Nothing from task descriptions or the Logins list is
--     imported. Every group is marked credential_migration_required so the
--     vault work is visible; passwords are re-keyed by hand (0225 vault).
--   • No canceled/inactive partners. Dee has not yet decided whether those
--     import as archived — they stay out until she does.
--
-- Merge, never duplicate (rule 2): matching is by normalized company OR
-- partner person name, so the two partners BES already holds (Wavy One
-- Solutions, Kevin Hernandez) are annotated with provenance, not re-created.
-- Their lifecycle, name and contact email are left exactly as they are.
--
-- Idempotent: every insert is guarded by a not-exists; re-running fills gaps.
-- On a database with no agency row (fresh local reset) it does nothing.
-- =============================================================================

do $$
declare
  v_agency uuid;
  v_batch  constant uuid := '9c2f7a5e-90b1-4e6a-8f43-2026090900aa';
  v_note   constant text :=
    'ClickUp logins NOT imported. Contact email and platform credentials must '
    || 'be re-keyed by hand from ClickUp into the credential vault.';
  n_groups_before int; n_groups_after int; n_services int; n_engagements int;
  n_unmatched int;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  if v_agency is null then
    raise notice 'clickup partner import: no agency row, nothing to do';
    return;
  end if;

  -- ── The roster, verbatim from the survey ─────────────────────────────────
  -- lifecycle: 'active partner *' → active; 'on hold' → on_hold.
  -- services:  'full' → creditops + bes_crm; tags refine (Nainoa: talentops).
  create temp table _cu (
    company   text not null,
    person    text,
    lifecycle public.partner_lifecycle not null,
    services  text[] not null,
    task_id   text,          -- ClickUp task id in the Partners Database
    norm      text
  ) on commit drop;

  insert into _cu (company, person, lifecycle, services, task_id) values
    ('CreditCure',                null,               'active',  array['creditops','bes_crm'],           '86eyp81yj'),
    ('K&A Consulting',            null,               'active',  array['bes_crm'],                       '86eyp81jq'),
    ('8F Solutions',              null,               'active',  array['bes_crm'],                       '86eyp80gc'),
    ('Bizhub',                    null,               'active',  array['bes_crm'],                       '86eyp7zdh'),
    ('Mikia Edwards',             'Mikia Edwards',    'active',  array['creditops'],                     '86eym4xxc'),
    ('ZackCredit',                'Zack Nabhan',      'active',  array['creditops'],                     '86eym4xp1'),
    ('Shawn Mcmanus LLC',         'Shawn Mcmanus',    'active',  array['creditops'],                     '86eym4xjb'),
    ('Kenneth Winfield (Upwork)', 'Kenneth Winfield', 'active',  array['creditops'],                     '86eym4x84'),
    ('Fundare Capital',           'Lucas Liu',        'active',  array['creditops'],                     '86eym4wb5'),
    ('Credify',                   'Jay Nunez',        'active',  array['creditops'],                     '86eym4w5t'),
    ('Romeo Credit Repair',       'Romeo',            'active',  array['creditops'],                     '86eym4vvb'),
    ('Wavy One Solutions',        'Quentin Grays',    'active',  array['creditops','bes_crm'],           '86eym4vhm'),
    ('Serenity Solutions',        'Tajohn Montgomery','active',  array['creditops'],                     '86eym4v3x'),
    ('Prime Capital Group',       'Parker Cathcart',  'active',  array['creditops'],                     '86eym4uw6'),
    ('Jensen',                    'Mike Cousin',      'active',  array['creditops'],                     '86eym4umj'),
    ('Jay Consulting',            'Javid Udai',       'active',  array['creditops'],                     '86eym4u2z'),
    ('BearwithUs Consulting, LLC','Wes Hall',         'active',  array['creditops'],                     '86eym4tuh'),
    ('Prime BTS',                 null,               'active',  array['creditops','bes_crm'],           '86eym4p30'),
    ('Approve with Tiff',         null,               'on_hold', array['creditops'],                     '86eym4kfv'),
    ('Vanquish Ventures',         'Lloyd Argame',     'active',  array['creditops'],                     '86eym4acg'),
    ('Business Made Fair',        'Samiyrah Robinson','on_hold', array['creditops','bes_crm'],           '86eym49xj'),
    ('EDP Management Group',      'Erika and Edgar',  'active',  array['creditops','bes_crm'],           '86eym49g7'),
    ('Big On Credit',             'Lena Love',        'active',  array['creditops'],                     '86eykn793'),
    ('Credit by Nainoa',          'Nainoa Shin',      'active',  array['creditops','talentops'],         '86eyjk76w'),
    ('No Limit Empire, LLC.',     'David Jimenez',    'active',  array['creditops','bes_crm'],           '86evyvnpu'),
    -- Folder-only partner: in BES and in a ClickUp client folder, absent from
    -- the Partners Database list (the survey's Kevin Hernandez finding).
    ('Blue Chip Equity',          'Kevin Hernandez',  'active',  array['creditops'],                     null);

  update _cu set norm = regexp_replace(lower(company), '[^a-z0-9]', '', 'g');

  select count(*) into n_groups_before from public.outsourcing_groups where agency_id = v_agency;

  -- ── Resolve each roster row to an existing group, if one matches ─────────
  create temp table _map on commit drop as
  select c.*, g.id as group_id
    from _cu c
    left join public.outsourcing_groups g
      on g.agency_id = v_agency
     and ( regexp_replace(lower(g.name), '[^a-z0-9]', '', 'g') = c.norm
        or ( c.person is not null
         and regexp_replace(lower(g.partner_name), '[^a-z0-9]', '', 'g')
           = regexp_replace(lower(c.person), '[^a-z0-9]', '', 'g') ) );

  -- Matched groups: annotate provenance only. Never touch their name,
  -- lifecycle, status or contact email — those are live operational values.
  update public.outsourcing_groups g
     set source_type      = 'clickup',
         source_row_ref   = coalesce(m.task_id, g.source_row_ref),
         source_reference = 'clickup:partners-database:901812869358',
         import_batch_id  = v_batch,
         imported_at      = now(),
         credential_migration_required = true,
         credential_note  = coalesce(g.credential_note, v_note)
    from _map m
   where m.group_id = g.id
     and g.import_batch_id is distinct from v_batch;

  -- New groups. contact_email is honestly empty — ClickUp's structured data
  -- has no email field, and descriptions (which do) are a credential store.
  insert into public.outsourcing_groups
        (agency_id, name, partner_name, contact_email, status, lifecycle,
         source_type, source_reference, source_row_ref,
         import_batch_id, imported_at,
         credential_migration_required, credential_note)
  select v_agency, m.company, coalesce(m.person, m.company), '',
         case when m.lifecycle = 'on_hold'
              then 'Paused'::public.outsourcing_group_status
              else 'Active'::public.outsourcing_group_status end,
         m.lifecycle,
         'clickup', 'clickup:partners-database:901812869358', m.task_id,
         v_batch, now(), true, v_note
    from _map m
   where m.group_id is null;

  -- Re-resolve so services and engagements see the new ids.
  update _map m
     set group_id = g.id
    from public.outsourcing_groups g
   where m.group_id is null
     and g.agency_id = v_agency
     and g.import_batch_id = v_batch
     and regexp_replace(lower(g.name), '[^a-z0-9]', '', 'g') = m.norm;

  select count(*) into n_unmatched from _map where group_id is null;
  if n_unmatched > 0 then
    raise exception 'clickup partner import: % roster rows failed to resolve to a group', n_unmatched;
  end if;

  -- ── Service rows: what each partner actually buys ────────────────────────
  insert into public.partner_services
        (group_id, agency_id, name, status, service_type,
         source_type, source_reference, source_row_ref, import_batch_id, imported_at)
  select m.group_id, v_agency,
         case s when 'creditops' then 'CreditOps Fulfillment'
                when 'bes_crm'   then 'BES CRM'
                when 'talentops' then 'TalentOps' end,
         case when m.lifecycle = 'on_hold'
              then 'paused'::public.partner_service_status
              else 'active'::public.partner_service_status end,
         case s when 'creditops' then 'CREDITOPS_FULFILLMENT'
                when 'bes_crm'   then 'BES_CRM'
                when 'talentops' then 'TALENTOPS' end,
         'clickup', 'clickup:partners-database:901812869358', m.task_id, v_batch, now()
    from _map m, unnest(m.services) as s
   where not exists (
           select 1 from public.partner_services ps
            where ps.group_id = m.group_id
              and ps.service_type = case s when 'creditops' then 'CREDITOPS_FULFILLMENT'
                                           when 'bes_crm'   then 'BES_CRM'
                                           when 'talentops' then 'TALENTOPS' end
              and ps.status in ('onboarding', 'active', 'paused'));

  -- ── Engagements: what authorizes BES to work it (rule 16) ────────────────
  -- On-hold partners get a PAUSED engagement: visible, not authorizing.
  insert into public.fulfillment_engagements
        (agency_id, outsourcing_group_id, service, status)
  select v_agency, m.group_id,
         s::public.fulfillment_service,
         case when m.lifecycle = 'on_hold'
              then 'paused'::public.engagement_status
              else 'active'::public.engagement_status end
    from _map m, unnest(m.services) as s
   where not exists (
           select 1 from public.fulfillment_engagements e
            where e.outsourcing_group_id = m.group_id
              and e.service = s::public.fulfillment_service
              and e.status in ('pending', 'active', 'paused'));

  select count(*) into n_groups_after from public.outsourcing_groups where agency_id = v_agency;
  select count(*) into n_services
    from public.partner_services where import_batch_id = v_batch;
  select count(*) into n_engagements
    from public.fulfillment_engagements e
    join _map m on m.group_id = e.outsourcing_group_id;

  raise notice 'clickup partner import: groups % -> %, % service rows in batch, % engagements across roster',
    n_groups_before, n_groups_after, n_services, n_engagements;
end $$;
