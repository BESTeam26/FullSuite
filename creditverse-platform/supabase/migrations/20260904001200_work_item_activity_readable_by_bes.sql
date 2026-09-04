-- Phase 8 follow-up, found in the browser: BES could not read its OWN
-- published update on a BES CRM project.
--
-- can_view_activity() gates a staff read of a non-internal event with an
-- organization through bes_may_fulfil(org, activity_service(entity_type)).
-- activity_service() knows only the two client types; for 'work_item' it
-- returns null, so the engagement lookup can never match and every published
-- or client-visible event on a work item was hidden from BES — including the
-- organization's own status changes on a workspace shared under TalentOps.
--
-- For work items the record's reach is already the gate: activity_events_select
-- is can_view_activity(...) AND entity_visible(...), and entity_visible on a
-- work item applies scope, engagement, share and assignment. So for entity
-- types without a governing client service, staff may read bes_internal,
-- shared_with_partner and client_visible; organization_internal stays the
-- customer's, whatever the record.
create or replace function public.can_view_activity(p_agency uuid, p_org uuid, p_visibility activity_visibility, p_entity_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_org is not null and public.is_org_member(p_org) then
      p_visibility in ('organization_internal', 'shared_with_partner', 'client_visible')

    when public.is_staff_of(p_agency) then
      case p_visibility
        when 'bes_internal' then true
        when 'organization_internal' then false
        else
          p_org is null
          or (public.activity_service(p_entity_type) is null)   -- record-level reach decides (entity_visible)
          or public.bes_may_fulfil(p_org, null, public.activity_service(p_entity_type))
      end

    else false
  end
$$;
