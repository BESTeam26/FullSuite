-- An organization's own people are active members too.
--
-- 20261015003000 made every assignment refuse a person who is "no longer
-- active", reading is_active_member() — which looked only at
-- agency_memberships. A customer organization's own processor (model 2:
-- SaaS + BES fulfillment; the organization works its own files) has an
-- org_membership and no agency membership, so the guard read them as
-- inactive and refused every assignment of their own clients to them. The
-- full matrix caught it (phase 26, 28: org.agent refused with 42501).
--
-- Active means: a live BES agency membership, or a live organization
-- membership. Nothing else changes; a deactivated BES member is still
-- refused.
--
-- Cost impact: none.

create or replace function public.is_active_member(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.status = 'active')
      or exists (select 1 from public.org_memberships om where om.user_id = p_user and om.archived_at is null)
$$;
