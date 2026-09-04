-- Phase 8: BES CRM — BES-owned delivery, controlled customer visibility.
--
-- Doctrine (rule 17): a BES CRM project is BES's work about a customer. The
-- customer may view approved progress and published activity, comment and
-- upload documents; it may not change status, assignment, dates or completion.
-- "Association is not publication" (rule 16): a record touching a customer's
-- organization does not become theirs to read.
--
-- What existed: work_items_select let any org admin read ANY AGENCY-scope item
-- whose subject_organization_id was their organization — including BES's
-- internal support tasks about the customer ("[TEST] Partner onboarding call").
-- That branch narrows to BES CRM projects (division = 'bes_crm') for
-- organizations entitled to 'crm'. The published/internal split is the
-- existing activity visibility: shared_with_partner / client_visible is what
-- BES publishes; bes_internal never reaches the customer (can_view_activity).
-- Files: a file with organization_id set on a project the customer can see is
-- shared; internal files carry no organization_id.
--
-- Customer writes on a CRM project are already governed: activity_events insert
-- allows an org member at organization_internal / shared_with_partner /
-- client_visible on a record they can see; files insert likewise; work_items
-- has no customer update branch for AGENCY items (deny by absence).

drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, false, assigned_to))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
      -- BES CRM: the customer sees its own delivery projects, when entitled.
      or (scope = 'AGENCY' and subject_organization_id is not null and division = 'bes_crm'
          and public.is_org_admin(subject_organization_id)
          and public.org_entitled(subject_organization_id, 'crm'))
    )
  );

-- Fixtures: Lakeside buys BES CRM delivery; one project with one published and
-- one internal update. Northgate has a project but no 'crm' entitlement.
insert into public.product_entitlements (organization_id, product, enabled) values
  ('dddddddd-0000-4000-8000-80ce8814eb05', 'crm', true),
  ('dddddddd-0000-4000-8000-3f3028d6b8f3', 'crm', false)
on conflict do nothing;

insert into public.work_items (id, scope, agency_id, subject_organization_id, related_type, division, title, description, stage, priority, due_at) values
  ('ee000000-0000-4000-8000-000000000201', 'AGENCY', 'a0000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-80ce8814eb05',
   'project', 'bes_crm', '[TEST] GHL CRM build — Lakeside', 'Fixture BES CRM delivery project.', 'In Processing', 'High', now() + interval '21 days'),
  ('ee000000-0000-4000-8000-000000000202', 'AGENCY', 'a0000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-3f3028d6b8f3',
   'project', 'bes_crm', '[TEST] Funnel build — Northgate', 'Fixture BES CRM delivery project (customer not entitled).', 'Queued', 'Normal', null)
on conflict do nothing;

insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name, action, detail, visibility) values
  ('a0000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-80ce8814eb05', 'work_item', 'ee000000-0000-4000-8000-000000000201', null, 'BES',
   'Note', 'Milestone: discovery complete; pipeline stages approved.', 'shared_with_partner'),
  ('a0000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-80ce8814eb05', 'work_item', 'ee000000-0000-4000-8000-000000000201', null, 'BES',
   'Note', 'Internal: automation scope risk — confirm SMS compliance before build.', 'bes_internal');
