-- Putting a partner into CreditOps is a control, not a migration.
--
-- Dee, 2026-09-24: "on BES PARTNERS, I don't see a way I can add the partner
-- in the creditops list as managed ops or outsourcing so it appear in the
-- creditops list."
--
-- There was no way, and it cost a migration this afternoon: Approve with Tiff
-- had 71 imported clients and did not appear in the CreditOps tree because
-- her engagement was `paused`, and nothing in the interface could change
-- that. `set_engagement_category` MOVES an engagement between folders but
-- cannot create one or end one, so a partner with no engagement at all was
-- unreachable from any screen.
--
-- ── WHAT THIS GRANTS, AND WHY IT IS THE SAME DOOR ─────────────────────────
--
-- An engagement is what authorizes BES to work a partner's files —
-- `bes_may_fulfil()` reads it, and the client rows follow. So this is an
-- access-granting control, and it deliberately uses the SAME capability as
-- the existing one, `partners.operations`, rather than inventing a second
-- door into the same room.
--
-- Ending an engagement sets `effective_to` and status `ended`. It deletes
-- nothing: the partner, their clients, files, history and assignments all
-- stay exactly where they are, and starting it again picks the relationship
-- up rather than rebuilding it. That is the same promise the sidebar's
-- category move already makes.
--
-- Every change writes an activity entry and an audit row, because who put a
-- partner into a workspace — and who took them out — is a question somebody
-- will ask.
--
-- Cost impact: no material increase.

begin;

create or replace function public.set_partner_service(
  p_group    uuid,
  p_service  public.fulfillment_service,
  p_category uuid          -- null ends the engagement
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agency uuid; v_partner text; v_actor text;
  v_engagement uuid; v_prev_status text; v_prev_label text; v_next_label text;
  v_model text; v_automatic boolean;
begin
  select g.agency_id, g.name into v_agency, v_partner
    from public.outsourcing_groups g where g.id = p_group and g.archived_at is null;
  if v_agency is null then
    raise exception 'No such partner' using errcode = '22023';
  end if;
  if not public.is_staff_of(v_agency) or not public.agency_can('partners.operations') then
    raise exception 'Managing partner operations is required to change a workspace'
      using errcode = '42501';
  end if;

  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();

  select e.id, e.status::text, c.label
    into v_engagement, v_prev_status, v_prev_label
    from public.fulfillment_engagements e
    left join public.module_categories c on c.id = e.operational_category_id
   where e.outsourcing_group_id = p_group and e.service = p_service
   order by e.created_at desc limit 1;

  /* ── ENDING IT ──────────────────────────────────────────────────────── */
  if p_category is null then
    if v_engagement is null then return null; end if;
    update public.fulfillment_engagements
       set status = 'ended', effective_to = current_date, updated_at = now()
     where id = v_engagement;

    insert into public.activity_events
      (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_agency, 'partner', p_group::text, auth.uid(), v_actor,
            'Workspace ended',
            coalesce(v_partner, 'This partner') || ' no longer has a live '
              || p_service::text || ' engagement. Nothing was deleted.',
            'engagement_status', v_prev_status, 'ended', 'bes_internal');
    perform public.log_audit('engagement.ended', 'fulfillment_engagement',
      v_engagement::text, null,
      jsonb_build_object('status', v_prev_status),
      jsonb_build_object('status', 'ended', 'service', p_service));
    return v_engagement;
  end if;

  /* ── STARTING OR MOVING IT ──────────────────────────────────────────── */
  select c.commitment_model, c.is_automatic, c.label
    into v_model, v_automatic, v_next_label
    from public.module_categories c
   where c.id = p_category and c.agency_id = v_agency
     and c.module = p_service::text and c.archived_at is null;
  if not found then
    raise exception 'That category does not belong to this module' using errcode = '22023';
  end if;
  if v_automatic then
    raise exception 'That category follows the customer''s own subscription. Partners are not placed into it'
      using errcode = '22023';
  end if;

  if v_engagement is null then
    insert into public.fulfillment_engagements
      (agency_id, outsourcing_group_id, service, status, effective_from,
       operational_category_id, category_source, commitment, created_by)
    values (v_agency, p_group, p_service, 'active', current_date,
            p_category, 'manual', v_model, auth.uid())
    returning id into v_engagement;
  else
    update public.fulfillment_engagements
       set status = 'active',
           /* A relationship resumed keeps the date it actually began. */
           effective_to = null,
           operational_category_id = p_category,
           commitment = coalesce(v_model, commitment),
           category_source = 'manual',
           updated_at = now()
     where id = v_engagement;
  end if;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail,
     field, previous_value, new_value, visibility)
  values (v_agency, 'partner', p_group::text, auth.uid(), v_actor,
          case when v_prev_status is null then 'Workspace started' else 'Workspace changed' end,
          coalesce(v_partner, 'This partner') || ' is in ' || v_next_label
            || ' for ' || p_service::text || '.',
          'engagement', coalesce(v_prev_label, v_prev_status), v_next_label, 'bes_internal');

  perform public.log_audit(
    case when v_prev_status is null then 'engagement.started' else 'engagement.changed' end,
    'fulfillment_engagement', v_engagement::text, null,
    jsonb_build_object('status', v_prev_status, 'category', v_prev_label),
    jsonb_build_object('status', 'active', 'category', v_next_label, 'service', p_service));

  return v_engagement;
end $function$;

revoke execute on function public.set_partner_service(uuid, public.fulfillment_service, uuid) from public, anon;
grant execute on function public.set_partner_service(uuid, public.fulfillment_service, uuid) to authenticated;

comment on function public.set_partner_service(uuid, public.fulfillment_service, uuid) is
  'Start, move or end a partner''s engagement for one module, which is what '
  'decides whether they appear in that module''s workspace. Needs '
  'partners.operations; ending deletes nothing (Dee, 2026-09-24).';

commit;
