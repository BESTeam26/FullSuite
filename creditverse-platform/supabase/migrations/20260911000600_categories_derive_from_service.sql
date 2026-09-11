-- =============================================================================
-- Operational category is derived from the SERVICE, not from SaaS tenancy.
--
-- Dee, 2026-09-11: "Managed Ops = BES manages the service/work. Do NOT use
-- SaaS tenancy to determine Managed Ops vs Outsourcing. SaaS tenancy is a
-- completely separate capability and must remain automatic."
--
-- 0302 got this wrong. It filed a new engagement by PROVENANCE — an
-- organization went to Managed Ops, an outsourcing group to Outsourcing —
-- which encoded "is a SaaS tenant" as an operational classification. That is
-- the conflation Dee had already ruled out, and it is replaced here entirely:
-- `default_for` and its trigger are dropped, not deprecated.
--
-- Nothing in this migration reads, writes or depends on
-- `organization_subscriptions`, `organization_trials`, `product_entitlements`
-- or `org_memberships`. Tenancy stays exactly where it was.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
--
--   a CreditOps fulfilment service   → Managed Ops   (BES owns the execution)
--   staffing services only           → Outsourcing   (BES supplies the people)
--   nothing to go on                 → Needs Review
--
-- The third line is Dee's correction and it matters more than the other two:
-- "Missing service data does not prove an Outsourcing relationship... I do not
-- want incomplete data silently turned into a business classification." An
-- engagement with no service recorded is an incomplete record, and it now says
-- so on the sidebar instead of quietly joining a category.
--
-- ── WHY SERVICE TYPES AND NOT SERVICE CATEGORIES ────────────────────────────
--
-- `partner_service_types.category` would have been shorter to write, and
-- wrong: TalentOps is a Staffing-category service, so a partner with a
-- CreditOps fulfilment engagement AND a TalentOps staffing engagement would
-- have had its CREDITOPS placement pulled around by a service belonging to
-- another module. Credit by Nainoa is exactly that partner today. Each
-- category names the service types that feed IT, so a service belonging to
-- another module simply is not on any CreditOps list and cannot vote.
--
-- Rows, not code: adding a service type to a category later is an UPDATE.
-- =============================================================================

-- ── 0302's provenance rule goes ─────────────────────────────────────────────
drop trigger if exists fulfillment_engagements_default_category on public.fulfillment_engagements;
drop function if exists public.engagement_default_category();
drop index if exists public.module_categories_one_default;
alter table public.module_categories drop column if exists default_for;

-- ── What feeds each category ────────────────────────────────────────────────
alter table public.module_categories
  add column if not exists derived_from_service_types text[] not null default '{}',
  /** Exactly one per module: where an engagement lands when nothing matched. */
  add column if not exists is_fallback boolean not null default false;

comment on column public.module_categories.derived_from_service_types is
  'Service type codes that place an engagement in this category automatically. Types, not categories: a Staffing service belonging to another module must not vote on this one (Dee, 2026-09-11).';
comment on column public.module_categories.is_fallback is
  'Where an engagement lands when no category claims it — an incomplete record, surfaced rather than guessed.';

create unique index if not exists module_categories_one_fallback
  on public.module_categories (agency_id, module)
  where is_fallback and archived_at is null;

-- ── The CreditOps catalogue ─────────────────────────────────────────────────
update public.module_categories
   set derived_from_service_types = array['CREDITOPS_FULFILLMENT']
 where module = 'creditops' and key = 'managed_ops';

/* TALENTOPS is deliberately absent: it is the TalentOps module's own headline
   service, and it must not drag a CreditOps engagement into Outsourcing. The
   rest are people BES supplies, which is what Outsourcing means. */
update public.module_categories
   set derived_from_service_types = array['CLIENT_SUPPORT', 'DEDICATED_STAFF',
         'CLIENT_SUCCESS', 'OPERATIONS_MANAGEMENT', 'EXECUTIVE_ASSISTANT',
         'HOURLY_SUPPORT']
 where module = 'creditops' and key = 'outsourcing';

insert into public.module_categories (agency_id, module, key, label, sort, is_fallback)
select a.id, 'creditops'::public.fulfillment_service, 'needs_review', 'Needs Review', 90, true
  from public.agencies a
on conflict (agency_id, module, key) do update set is_fallback = true, sort = 90;

-- ── auto vs manual ──────────────────────────────────────────────────────────
alter table public.fulfillment_engagements
  add column if not exists category_source text not null default 'auto'
  check (category_source in ('auto', 'manual'));

comment on column public.fulfillment_engagements.category_source is
  'auto: the category follows the canonical service relationship and is recomputed when it changes. manual: BES moved this deliberately and automation must never overwrite it (Dee, 2026-09-11).';

-- ── The derivation ──────────────────────────────────────────────────────────
/**
 * Which category this engagement belongs in, from the partner's ACTIVE
 * services alone. Stable and side-effect free, so it can be called from a
 * trigger, from a repair, or read on its own to explain a placement.
 *
 * Ordered by `sort`, so a partner holding both a fulfilment and a staffing
 * service resolves to Managed Ops — BES owning the execution is the stronger
 * statement about the relationship.
 */
create or replace function public.derive_engagement_category(p_engagement uuid)
returns uuid
language sql stable security definer set search_path = public as $function$
  with e as (
    select * from public.fulfillment_engagements where id = p_engagement
  ), owned as (
    select s.service_type
      from public.partner_services s, e
     where s.status = 'active'
       and (s.group_id = e.outsourcing_group_id)
  )
  select coalesce(
    (select c.id
       from public.module_categories c, e
      where c.agency_id = e.agency_id and c.module = e.service
        and c.archived_at is null
        and exists (select 1 from owned o where o.service_type = any (c.derived_from_service_types))
      order by c.sort
      limit 1),
    (select c.id
       from public.module_categories c, e
      where c.agency_id = e.agency_id and c.module = e.service
        and c.archived_at is null and c.is_fallback
      limit 1))
$function$;

comment on function public.derive_engagement_category(uuid) is
  'The operational category the canonical service records imply. Reads partner_services only — never subscriptions, entitlements or tenancy.';

-- ── Keeping `auto` engagements current ──────────────────────────────────────
/**
 * Applied when an engagement is created, and again whenever the partner's
 * services change. `manual` rows are skipped, always: an override Dee made is
 * not a blank for automation to fill.
 */
create or replace function public.refresh_engagement_categories(p_group uuid default null)
returns void
language sql security definer set search_path = public as $function$
  update public.fulfillment_engagements e
     set operational_category_id = public.derive_engagement_category(e.id),
         updated_at = now()
   where e.category_source = 'auto'
     and (p_group is null or e.outsourcing_group_id = p_group)
     and e.operational_category_id is distinct from public.derive_engagement_category(e.id)
$function$;
revoke execute on function public.refresh_engagement_categories(uuid) from public, anon, authenticated;

create or replace function public.engagement_derive_category()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.category_source = 'auto' and new.operational_category_id is null then
    new.operational_category_id := public.derive_engagement_category(new.id);
  end if;
  return new;
end $function$;
revoke execute on function public.engagement_derive_category() from public, anon, authenticated;

/* AFTER, not BEFORE: the derivation reads the engagement by id, so the row has
   to exist. A BEFORE trigger would look it up and find nothing. */
create or replace function public.engagement_derive_category_after()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.category_source = 'auto' and new.operational_category_id is null then
    update public.fulfillment_engagements
       set operational_category_id = public.derive_engagement_category(new.id)
     where id = new.id;
  end if;
  return null;
end $function$;
revoke execute on function public.engagement_derive_category_after() from public, anon, authenticated;

drop trigger if exists fulfillment_engagements_derive_category on public.fulfillment_engagements;
create trigger fulfillment_engagements_derive_category
  after insert on public.fulfillment_engagements
  for each row execute function public.engagement_derive_category_after();

/* A service added, retired or re-typed changes what the relationship IS, so
   every `auto` engagement for that partner is recomputed. */
create or replace function public.partner_service_refresh_categories()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.refresh_engagement_categories(coalesce(new.group_id, old.group_id));
  return null;
end $function$;
revoke execute on function public.partner_service_refresh_categories() from public, anon, authenticated;

drop trigger if exists partner_services_refresh_categories on public.partner_services;
create trigger partner_services_refresh_categories
  after insert or update of service_type, status, group_id or delete on public.partner_services
  for each row execute function public.partner_service_refresh_categories();

-- ── Re-file everything under the correct rule ───────────────────────────────
/* Every engagement is still `auto` — nobody has overridden anything yet — so
   this replaces 0301's provenance backfill wholesale. */
select public.refresh_engagement_categories();
