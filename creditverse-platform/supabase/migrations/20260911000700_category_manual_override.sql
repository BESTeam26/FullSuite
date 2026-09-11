-- =============================================================================
-- The override, and the way back from it.
--
-- 0303 made placement automatic. This is the exception Dee asked for in the
-- first place: she saw an account in the wrong section and wanted to correct
-- it without editing records. Two operations, and the pair is the whole point
-- — an override nobody can undo is a trap.
--
--   set_engagement_category   move it, and hold it there (category_source = manual)
--   follow_automatic_placement  hand it back to the derivation (= auto, recomputed)
--
-- Neither touches SaaS tenancy, subscriptions, entitlements, membership, the
-- service, the module or the engagement's status. Proved by probe, not by
-- assertion: phase 72 diffs the whole row across a move.
-- =============================================================================

create or replace function public.set_engagement_category(p_engagement uuid, p_category uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_service public.fulfillment_service; v_prev uuid;
  v_org uuid; v_group uuid;
  v_prev_label text; v_next_label text; v_partner text; v_actor text;
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
  if p_category is null then
    raise exception 'Pick a category, or choose Follow automatic placement'
      using errcode = '22023';
  end if;
  /* The composite foreign key already refuses a category from another module.
     Checked here so the caller gets a sentence rather than a constraint. */
  if not exists (select 1 from public.module_categories c
                  where c.id = p_category and c.agency_id = v_agency
                    and c.module = v_service and c.archived_at is null) then
    raise exception 'That category does not belong to this module' using errcode = '22023';
  end if;

  /* Deliberate even when the category does not change: choosing where
     something sits is what pins it against the derivation. */
  update public.fulfillment_engagements
     set operational_category_id = p_category,
         category_source = 'manual',
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

    /* An organisation change, deliberately NOT a service or status event:
       inventing lifecycle history here would make the engagement's own record
       lie about what BES was hired to do. */
    perform public.log_audit(
      'engagement.categorised', 'fulfillment_engagement', p_engagement::text,
      v_org, jsonb_build_object('operational_category_id', v_prev, 'category_source', 'auto'),
      jsonb_build_object('operational_category_id', p_category, 'category_source', 'manual',
                         'module', v_service));
  end if;
end $function$;

revoke execute on function public.set_engagement_category(uuid, uuid) from public, anon;
grant execute on function public.set_engagement_category(uuid, uuid) to authenticated;

-- ── Handing it back to the system ───────────────────────────────────────────
create or replace function public.follow_automatic_placement(p_engagement uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_service public.fulfillment_service; v_prev uuid; v_next uuid;
  v_org uuid; v_group uuid;
  v_prev_label text; v_next_label text; v_partner text; v_actor text;
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

  v_next := public.derive_engagement_category(p_engagement);

  update public.fulfillment_engagements
     set category_source = 'auto',
         operational_category_id = v_next,
         updated_at = now()
   where id = p_engagement;

  if v_prev is distinct from v_next then
    select label into v_prev_label from public.module_categories where id = v_prev;
    select label into v_next_label from public.module_categories where id = v_next;
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
       'Returned to automatic placement',
       coalesce(v_partner, 'This account') || ' now follows its service relationship, moving from ' ||
         coalesce(v_prev_label, 'Uncategorised') || ' to ' ||
         coalesce(v_next_label, 'Uncategorised') || ' in ' || v_service::text,
       'operational_category', v_prev_label, v_next_label, 'bes_internal');
  end if;

  perform public.log_audit(
    'engagement.category_automatic', 'fulfillment_engagement', p_engagement::text,
    v_org, jsonb_build_object('operational_category_id', v_prev, 'category_source', 'manual'),
    jsonb_build_object('operational_category_id', v_next, 'category_source', 'auto',
                       'module', v_service));
  return v_next;
end $function$;

revoke execute on function public.follow_automatic_placement(uuid) from public, anon;
grant execute on function public.follow_automatic_placement(uuid) to authenticated;
