-- =============================================================================
-- Operational categories: how BES files its active accounts inside a module.
--
-- Dee, 2026-09-11: "Managed Ops / Outsourcing may stop meaning SaaS tenant vs
-- outsourcing-only. They should become true operational categories chosen by
-- BES. Keep SaaS provenance separately in the data model if needed, but do not
-- use it as the visible operational grouping."
--
-- ── WHAT THOSE HEADINGS WERE ────────────────────────────────────────────────
--
-- Nothing. They were computed in the browser from the RECORD TYPE: a SaaS
-- `organizations` row with a live engagement rendered under MANAGED OPS, an
-- `outsourcing_groups` row rendered under OUTSOURCING, and a SaaS row without
-- an engagement under CREDITOPS USERS. Nobody had ever chosen any of it, and
-- there was no column to change.
--
-- Provenance does not disappear: it is still `organization_id` vs
-- `outsourcing_group_id` on the engagement, and `mode` on the partner. It just
-- stops being the visible filing system.
--
-- ── WHERE THE CATEGORY LIVES, AND WHY THERE ─────────────────────────────────
--
-- On the ENGAGEMENT, because an engagement row already IS (partner × module).
-- Two consequences fall out for free rather than being built:
--
--   * one partner, different categories per module — CreditOps → Outsourcing
--     while BES CRM → its own category — because those are different rows;
--   * pause and resume keep the category, because `status` and
--     `operational_category_id` are columns on the same row.
--
-- A `folder` column on the partner would have given one global answer for a
-- partner who is in three modules, which is the duplicate-source-of-truth Dee
-- ruled out.
--
-- ── THE COMPOSITE FOREIGN KEY IS THE POINT ──────────────────────────────────
--
-- `(operational_category_id, service)` references `(id, module)`, so a
-- CreditOps engagement can only ever carry a CreditOps category. A plain FK on
-- the id alone would happily let a BES CRM category be filed against a
-- CreditOps engagement, and nothing would notice until somebody looked at a
-- sidebar. ON DELETE RESTRICT, not SET NULL: a composite SET NULL would try to
-- null `service` too, which is NOT NULL. Categories are archived, not deleted.
-- =============================================================================

create table public.module_categories (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  /** The BES operating environment these categories organise. */
  module      public.fulfillment_service not null,
  /** Stable across renames — what code and history refer to. */
  key         text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  /** What people read. Renaming this renames nothing else. */
  label       text not null check (length(btrim(label)) between 1 and 40),
  sort        integer not null default 0,
  /** Archived, never deleted: a category that has held accounts is history. */
  archived_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint module_categories_key_unique unique (agency_id, module, key),
  /* The target of the engagement's composite FK below. */
  constraint module_categories_id_module unique (id, module)
);

comment on table public.module_categories is
  'How BES files the active accounts inside one operating module. Per agency and per module, because CreditOps and BES CRM do not organise work the same way (Dee, 2026-09-11).';

create index module_categories_module_idx
  on public.module_categories (agency_id, module, sort) where archived_at is null;

alter table public.fulfillment_engagements
  add column if not exists operational_category_id uuid;

alter table public.fulfillment_engagements
  drop constraint if exists fulfillment_engagements_category_fk;
alter table public.fulfillment_engagements
  add constraint fulfillment_engagements_category_fk
  foreign key (operational_category_id, service)
  references public.module_categories (id, module)
  on delete restrict;

comment on column public.fulfillment_engagements.operational_category_id is
  'Where this engagement is filed inside its module. Organisation, not lifecycle: pausing or completing removes the engagement from the active workspace and leaves this untouched, so reactivating restores it to where it was.';

create index fulfillment_engagements_category_idx
  on public.fulfillment_engagements (operational_category_id);

-- ── The CreditOps catalogue ─────────────────────────────────────────────────
/* Seeded for CreditOps only. FundingOps, BES CRM and TalentOps get their own
   categories when their workspaces need them — CreditOps' names are not BES
   universals (Dee). Until then their engagements carry no category and their
   sidebars group as they always have. */
insert into public.module_categories (agency_id, module, key, label, sort)
select a.id, 'creditops'::public.fulfillment_service, v.key, v.label, v.sort
  from public.agencies a
 cross join (values ('managed_ops', 'Managed Ops', 10),
                    ('outsourcing', 'Outsourcing', 20)) as v(key, label, sort)
on conflict (agency_id, module, key) do nothing;

-- ── Backfill: everything lands exactly where it is showing today ────────────
/* The mapping is the rule the browser was applying, made durable:
     a SaaS organization  → Managed Ops
     an outsourcing group → Outsourcing
   So the sidebar on the morning after this migration looks identical to the
   evening before, and every later move is a decision somebody made. */
update public.fulfillment_engagements e
   set operational_category_id = c.id
  from public.module_categories c
 where e.service = 'creditops'
   and e.operational_category_id is null
   and c.agency_id = e.agency_id
   and c.module = 'creditops'
   and c.key = case when e.organization_id is not null then 'managed_ops' else 'outsourcing' end;

-- ── Reading the catalogue ───────────────────────────────────────────────────
alter table public.module_categories enable row level security;

/* Any BES staff member sees the same hierarchy — Dee's read-only users must
   see exactly what everybody else sees, they simply cannot rearrange it. */
create policy module_categories_select on public.module_categories
  for select using (public.is_staff_of(agency_id));

/* No INSERT/UPDATE/DELETE policy: the catalogue is managed through functions,
   so there is one place that checks the capability. A table policy would be a
   second place to keep in step (rule 3). */

grant select on public.module_categories to authenticated;

-- ── Moving an account between categories ────────────────────────────────────
/**
 * The whole operation, server-side, so the UI is presentation and not
 * protection (rule 1). Refuses unless the caller holds `partners.operations`
 * — the capability that already means "manage partner operations", rather
 * than a new key nobody has granted.
 *
 * SECURITY DEFINER because it writes `activity_events`, which is append-only
 * to browsers. It authorises itself first and takes no agency argument: the
 * agency comes from the engagement, so a caller cannot reach across tenants
 * by passing a different one.
 *
 * p_category null files the engagement as uncategorised, which is what a
 * module with no catalogue yet looks like. It is not an archive and not a
 * status change: lifecycle lives in `status`, and this function never touches
 * it (Dee — "keep those concepts separate").
 */
create or replace function public.set_engagement_category(p_engagement uuid, p_category uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_service public.fulfillment_service; v_prev uuid;
  v_org uuid; v_group uuid;
  v_prev_label text; v_next_label text; v_partner text; v_entity text; v_actor text;
begin
  select e.agency_id, e.service, e.operational_category_id, e.organization_id, e.outsourcing_group_id
    into v_agency, v_service, v_prev, v_org, v_group
    from public.fulfillment_engagements e where e.id = p_engagement;
  if v_agency is null then
    raise exception 'No such engagement' using errcode = '22023';
  end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('partners.operations') then
    raise exception 'Managing partner operations is required to reorganise the workspace'
      using errcode = '42501';
  end if;

  /* The composite foreign key already refuses a category from another module.
     Checked here too so the caller gets a sentence instead of a constraint. */
  if p_category is not null and not exists (
       select 1 from public.module_categories c
        where c.id = p_category and c.agency_id = v_agency
          and c.module = v_service and c.archived_at is null) then
    raise exception 'That category does not belong to this module' using errcode = '22023';
  end if;

  if v_prev is not distinct from p_category then return; end if;

  update public.fulfillment_engagements
     set operational_category_id = p_category, updated_at = now()
   where id = p_engagement;

  select label into v_prev_label from public.module_categories where id = v_prev;
  select label into v_next_label from public.module_categories where id = p_category;
  select coalesce(o.name, g.name) into v_partner
    from (select 1) x
    left join public.organizations o on o.id = v_org
    left join public.outsourcing_groups g on g.id = v_group;
  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();

  /* The partner timeline is keyed on the partner, whichever kind it is. */
  v_entity := coalesce(v_group::text, v_org::text);

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (v_agency, v_org, case when v_group is not null then 'partner' else 'organization' end,
     v_entity, auth.uid(), v_actor,
     'Moved between categories',
     coalesce(v_partner, 'This account') || ' moved from ' ||
       coalesce(v_prev_label, 'Uncategorised') || ' to ' ||
       coalesce(v_next_label, 'Uncategorised') || ' in ' || v_service::text,
     'operational_category', v_prev_label, v_next_label, 'bes_internal');

  /* Deliberately NOT a service or status event: nothing about what BES was
     hired to do has changed, and inventing lifecycle history here would make
     the engagement's own record lie. */
  perform public.log_audit(
    'engagement.categorised', 'fulfillment_engagement', p_engagement::text,
    v_org, jsonb_build_object('operational_category_id', v_prev),
    jsonb_build_object('operational_category_id', p_category, 'module', v_service));
end $function$;

revoke execute on function public.set_engagement_category(uuid, uuid) from public, anon;
grant execute on function public.set_engagement_category(uuid, uuid) to authenticated;
