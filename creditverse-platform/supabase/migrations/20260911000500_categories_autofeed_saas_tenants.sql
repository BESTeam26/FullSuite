-- =============================================================================
-- A SaaS tenant files itself. Nobody ever places one by hand.
--
-- Dee, 2026-09-11: "I need the SAAS tenant to become AUTOFEED still once
-- there's a tenant. WE NEVER Manual them."
--
-- 0301 gave categories a home and backfilled the accounts that existed. That
-- left a hole it did not close: the NEXT engagement — a tenant signing up
-- tonight, an engagement opened next month — would arrive with no category and
-- sit in an Uncategorised heap until somebody noticed and dragged it. An
-- operating list that needs manual filing to stay correct is one that is
-- quietly wrong most of the time.
--
-- ── PROVENANCE DECIDES THE DEFAULT, AND NOTHING ELSE ────────────────────────
--
-- Dee also ruled that provenance must stop being the visible grouping. Both
-- things are true at once, and the distinction is worth stating precisely:
--
--   * provenance (SaaS tenant vs outsourced partner) chooses where a NEW
--     engagement lands, once, automatically;
--   * from that moment the category is BES's to change, and the sidebar reads
--     the category — never the provenance.
--
-- So a tenant auto-feeds into Managed Ops and can then be moved to
-- Outsourcing, and it STAYS in Outsourcing. The trigger fires on INSERT only:
-- it fills a blank, it does not police one.
--
-- ── WHY A COLUMN AND NOT `key = 'managed_ops'` IN THE TRIGGER ───────────────
--
-- Hardcoding the CreditOps key would make CreditOps' vocabulary the rule for
-- every module, which is exactly what Dee ruled out. Each module's catalogue
-- says which of ITS OWN categories is the landing place for each kind of
-- partner, or says nothing and its engagements arrive uncategorised.
-- =============================================================================

alter table public.module_categories
  add column if not exists default_for text
  check (default_for is null or default_for in ('saas', 'outsourced'));

comment on column public.module_categories.default_for is
  'Where a NEW engagement of this provenance lands in this module: `saas` for a BES SaaS tenant, `outsourced` for a partner with no tenant. Fills a blank once at insert; it never overrides a category somebody chose (Dee, 2026-09-11).';

/* One landing place per provenance per module, or the trigger would have to
   pick between two and the choice would be arbitrary. */
create unique index if not exists module_categories_one_default
  on public.module_categories (agency_id, module, default_for)
  where default_for is not null and archived_at is null;

update public.module_categories set default_for = 'saas'
 where module = 'creditops' and key = 'managed_ops';
update public.module_categories set default_for = 'outsourced'
 where module = 'creditops' and key = 'outsourcing';

-- ── The autofeed ────────────────────────────────────────────────────────────
/**
 * BEFORE INSERT, so the row is never briefly visible uncategorised, and so a
 * category that arrives WITH the insert is respected rather than overwritten.
 *
 * Silent when the module has no catalogue: FundingOps, BES CRM and TalentOps
 * have no categories yet, their engagements arrive with none, and their
 * sidebars group as they always have. Adding a catalogue for one of them later
 * is rows, not code.
 */
create or replace function public.engagement_default_category()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.operational_category_id is not null then return new; end if;

  select c.id into new.operational_category_id
    from public.module_categories c
   where c.agency_id = new.agency_id
     and c.module = new.service
     and c.archived_at is null
     and c.default_for = case when new.organization_id is not null then 'saas' else 'outsourced' end;

  return new;
end $function$;
revoke execute on function public.engagement_default_category() from public, anon, authenticated;

drop trigger if exists fulfillment_engagements_default_category on public.fulfillment_engagements;
create trigger fulfillment_engagements_default_category
  before insert on public.fulfillment_engagements
  for each row execute function public.engagement_default_category();

/* Anything 0301 could not reach — an engagement created between the two
   migrations — lands the same way, once. */
update public.fulfillment_engagements e
   set operational_category_id = c.id
  from public.module_categories c
 where e.operational_category_id is null
   and c.agency_id = e.agency_id
   and c.module = e.service
   and c.archived_at is null
   and c.default_for = case when e.organization_id is not null then 'saas' else 'outsourced' end;
