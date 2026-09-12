-- =============================================================================
-- The three CreditOps folders, spelled the way Dee actually runs the business.
--
-- Dee, 2026-09-11:
--
--   "ManageOps are for those paying us weekly commitment and we have full
--    access on everything. Outsourcing are those who are paying us per client
--    per round and no commitment, thus I need my agents to see that clearly in
--    this separation. Now, you removed the CreditOps Users for future users on
--    the CreditOps CRM I am building that will autofeed clients info in the
--    workspace."
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
--
-- 0303 derived the folder from the SERVICE TYPE: a CreditOps fulfilment
-- service meant Managed Ops. That can never be right, because Managed Ops and
-- Outsourcing are not two kinds of work — they are two kinds of CONTRACT over
-- the same work. Every one of these partners buys CreditOps fulfilment; what
-- separates them is whether they pay a weekly commitment or per client per
-- round. The derivation had no way to know that, so it guessed Managed Ops for
-- everybody and Dee corrected thirteen of twenty-one accounts by hand.
--
-- The signal is now stored instead of guessed. `commitment` is the contract
-- term, it sits on the engagement (the contract is exactly what an engagement
-- IS), and the folder follows it. Dee's thirteen drags are backfilled into it
-- below, so the corrections become the data rather than a pile of overrides to
-- repeat on the next partner list.
--
-- ── AND CREDITOPS USERS COMES BACK ──────────────────────────────────────────
--
-- It is not a third contract; it is the SaaS side. Organizations running the
-- CreditOps CRM themselves, who will autofeed their client records into the
-- workspace. Membership is tenancy, so it is automatic and nothing is ever
-- dragged into it — which is why it carries `is_automatic` and holds no
-- engagements. It grants no access to anything: an organization with no live
-- fulfilment engagement is refused every client row by `bes_may_fulfil()`
-- exactly as before, so the folder shows the tenant and a count of zero until
-- BES is actually engaged (rule 16).
-- =============================================================================

-- ── The contract term ───────────────────────────────────────────────────────
alter table public.fulfillment_engagements
  add column if not exists commitment text
  check (commitment is null or commitment in ('weekly_retainer', 'per_client_round'));

comment on column public.fulfillment_engagements.commitment is
  'How the partner pays for this service. weekly_retainer: a weekly commitment, BES has full access (Managed Ops). per_client_round: paid per client per round, no commitment (Outsourcing). Null means nobody has recorded the terms yet, which shows as Needs Review rather than being guessed (Dee, 2026-09-11).';

-- ── Which folder each term belongs to ───────────────────────────────────────
alter table public.module_categories
  add column if not exists commitment_model text
    check (commitment_model is null or commitment_model in ('weekly_retainer', 'per_client_round')),
  /** Membership comes from somewhere other than an engagement — tenancy, for
   *  CreditOps Users. Never a drop target: there is nothing to move. */
  add column if not exists is_automatic boolean not null default false;

comment on column public.module_categories.commitment_model is
  'The contract term that files an engagement here. One per module, or the derivation would have to choose between two.';
comment on column public.module_categories.is_automatic is
  'Membership is derived from something other than an engagement (CreditOps Users is derived from SaaS tenancy). Accounts are never placed here by hand.';

create unique index if not exists module_categories_one_per_commitment
  on public.module_categories (agency_id, module, commitment_model)
  where commitment_model is not null and archived_at is null;

update public.module_categories set commitment_model = 'weekly_retainer'
 where module = 'creditops' and key = 'managed_ops';
update public.module_categories set commitment_model = 'per_client_round'
 where module = 'creditops' and key = 'outsourcing';

-- ── The service-type rule is retired, not deprecated ────────────────────────
/* Kept as dead columns it would only ever mislead the next reader (rule 6). */
drop trigger if exists partner_services_refresh_categories on public.partner_services;
drop function if exists public.partner_service_refresh_categories();
alter table public.module_categories drop column if exists derived_from_service_types;

-- ── CreditOps Users ─────────────────────────────────────────────────────────
insert into public.module_categories (agency_id, module, key, label, sort, is_automatic)
select a.id, 'creditops'::public.fulfillment_service, 'creditops_users', 'CreditOps Users', 30, true
  from public.agencies a
on conflict (agency_id, module, key) do update
  set label = excluded.label, sort = excluded.sort, is_automatic = true, archived_at = null;

update public.module_categories set sort = 40 where module = 'creditops' and key = 'needs_review';

-- ── Backfill: where Dee has already put them IS the contract term ───────────
/* Thirteen accounts were dragged to Outsourcing and eight left in Managed Ops.
   That is a complete answer for every live account, so it is read straight off
   the current placement rather than asked for again. */
update public.fulfillment_engagements e
   set commitment = c.commitment_model
  from public.module_categories c
 where c.id = e.operational_category_id
   and c.commitment_model is not null
   and e.commitment is null;

/* A placement the recorded term now explains is not an override any more.
   Flipping those rows back to `auto` clears the "Set" tag from Dee's thirteen
   accounts and lets the derivation keep them right from here on — which is the
   whole difference between encoding the signal and repeating the drags. */
update public.fulfillment_engagements e
   set category_source = 'auto'
  from public.module_categories c
 where c.id = e.operational_category_id
   and c.commitment_model is not null
   and c.commitment_model = e.commitment
   and e.category_source = 'manual';

-- ── The derivation, now reading the term ────────────────────────────────────
/**
 * Which folder this engagement belongs in.
 *
 * Reads `commitment` and nothing else — not the service, not the partner's
 * other services, and (as before) never subscriptions, entitlements or
 * tenancy. An engagement with no recorded term falls to Needs Review, because
 * "we have not written down how they pay" is a real state and must not be
 * silently rendered as one of the two answers.
 */
create or replace function public.derive_engagement_category(p_engagement uuid)
returns uuid
language sql stable security definer set search_path = public as $function$
  with e as (
    select * from public.fulfillment_engagements where id = p_engagement
  )
  select coalesce(
    (select c.id
       from public.module_categories c, e
      where c.agency_id = e.agency_id and c.module = e.service
        and c.archived_at is null
        and e.commitment is not null
        and c.commitment_model = e.commitment
      limit 1),
    (select c.id
       from public.module_categories c, e
      where c.agency_id = e.agency_id and c.module = e.service
        and c.archived_at is null and c.is_fallback
      limit 1))
$function$;

comment on function public.derive_engagement_category(uuid) is
  'The folder the engagement''s contract term implies. Reads fulfillment_engagements.commitment only — never subscriptions, entitlements or tenancy.';

-- ── Moving an account records the term, it does not just pin the row ────────
/**
 * `set_engagement_category` already existed and already did the permission
 * check, the module check, the activity entry and the audit record. The one
 * thing added here is the point of this migration: dragging an account into
 * Managed Ops or Outsourcing WRITES THE CONTRACT TERM. The placement then
 * follows automatically and stays `auto`, so the same partner re-imported
 * tomorrow lands in the right folder without being dragged again.
 *
 * A folder with no term behind it (Needs Review) is still a plain pin, and an
 * automatic folder cannot be dropped into at all.
 */
create or replace function public.set_engagement_category(p_engagement uuid, p_category uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_service public.fulfillment_service; v_prev uuid;
  v_org uuid; v_group uuid; v_prev_commitment text;
  v_model text; v_automatic boolean;
  v_prev_label text; v_next_label text; v_partner text; v_actor text;
begin
  select e.agency_id, e.service, e.operational_category_id, e.organization_id,
         e.outsourcing_group_id, e.commitment
    into v_agency, v_service, v_prev, v_org, v_group, v_prev_commitment
    from public.fulfillment_engagements e where e.id = p_engagement;
  if v_agency is null then
    raise exception 'No such engagement' using errcode = '22023';
  end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('partners.operations') then
    raise exception 'Managing partner operations is required to reorganise the workspace'
      using errcode = '42501';
  end if;
  if p_category is null then
    raise exception 'Pick a category, or choose Follow automatic placement'
      using errcode = '22023';
  end if;

  select c.commitment_model, c.is_automatic into v_model, v_automatic
    from public.module_categories c
   where c.id = p_category and c.agency_id = v_agency
     and c.module = v_service and c.archived_at is null;
  if not found then
    raise exception 'That category does not belong to this module' using errcode = '22023';
  end if;
  if v_automatic then
    raise exception 'CreditOps Users follows the customer''s subscription. Accounts are not moved into it'
      using errcode = '22023';
  end if;

  update public.fulfillment_engagements
     set operational_category_id = p_category,
         /* The term when the folder has one; otherwise the placement is the
            plain pin it always was. */
         commitment = coalesce(v_model, commitment),
         category_source = case when v_model is not null then 'auto' else 'manual' end,
         updated_at = now()
   where id = p_engagement;

  if v_prev is distinct from p_category then
    select label into v_prev_label from public.module_categories where id = v_prev;
    select label into v_next_label from public.module_categories where id = p_category;
    select coalesce(o.name, g.name) into v_partner
      from (select 1) x
      left join public.organizations o on o.id = v_org
      left join public.outsourcing_groups g on g.id = v_group;
    select coalesce(pr.full_name, pr.email) into v_actor
      from public.profiles pr where pr.id = auth.uid();

    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values
      (v_agency, v_org,
       case when v_group is not null then 'partner' else 'organization' end,
       coalesce(v_group::text, v_org::text), auth.uid(), v_actor,
       'Moved between categories',
       coalesce(v_partner, 'This account') || ' moved from ' ||
         coalesce(v_prev_label, 'Uncategorised') || ' to ' ||
         coalesce(v_next_label, 'Uncategorised') || ' in ' || v_service::text,
       'operational_category', v_prev_label, v_next_label, 'bes_internal');

    perform public.log_audit(
      'engagement.categorised', 'fulfillment_engagement', p_engagement::text,
      v_org, jsonb_build_object('operational_category_id', v_prev, 'commitment', v_prev_commitment),
      jsonb_build_object('operational_category_id', p_category,
                         'commitment', coalesce(v_model, v_prev_commitment),
                         'module', v_service));
  end if;
end $function$;

revoke execute on function public.set_engagement_category(uuid, uuid) from public, anon;
grant execute on function public.set_engagement_category(uuid, uuid) to authenticated;

-- ── Keep every `auto` row agreeing with its term ────────────────────────────
create or replace function public.engagement_commitment_refiles()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.category_source = 'auto'
     and new.commitment is distinct from old.commitment then
    update public.fulfillment_engagements
       set operational_category_id = public.derive_engagement_category(new.id)
     where id = new.id;
  end if;
  return null;
end $function$;
revoke execute on function public.engagement_commitment_refiles() from public, anon, authenticated;

drop trigger if exists fulfillment_engagements_commitment_refiles on public.fulfillment_engagements;
create trigger fulfillment_engagements_commitment_refiles
  after update of commitment on public.fulfillment_engagements
  for each row execute function public.engagement_commitment_refiles();

-- ── Re-file everything under the term ───────────────────────────────────────
select public.refresh_engagement_categories();
