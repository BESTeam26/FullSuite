-- Phase 7: the TalentOps bridge.
--
-- Doctrine (rule 17): the organization never re-creates its tasks inside BES.
-- One canonical work record; BES sees it only when an active service
-- relationship authorizes access. That relationship already exists —
-- fulfillment_engagements with service 'talentops' — and the unit it
-- authorizes is a workspace (or one of its boards). One row says so.
--
-- Everything downstream follows the workspace: this migration changes the ONE
-- place workspace visibility is decided (a helper) and re-points the policies
-- written in 0028 at it. No task is copied; time, production, EOD and
-- reporting keep reading work_items.

create table public.workspace_shares (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  engagement_id uuid not null references public.fulfillment_engagements(id) on delete cascade,
  board_id      uuid references public.workspace_boards(id) on delete cascade,   -- null = whole workspace
  access        text not null default 'work' check (access in ('view', 'work')),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique nulls not distinct (workspace_id, engagement_id, board_id)
);
create index workspace_shares_ws_idx on public.workspace_shares (workspace_id) where revoked_at is null;

comment on table public.workspace_shares is
  'An organization shares a workspace (or one board) with BES under a live TalentOps engagement. Revoke by setting revoked_at.';

-- The engagement must be TalentOps, for the workspace's own organization; the
-- board must belong to the workspace. An organization cannot share under
-- someone else's engagement.
create or replace function public.workspace_shares_consistency()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select w.organization_id into v_org from public.workspaces w where w.id = new.workspace_id;
  if v_org is null then raise exception 'workspace not found' using errcode = '23514'; end if;
  if not exists (select 1 from public.fulfillment_engagements e
                  where e.id = new.engagement_id and e.service = 'talentops' and e.organization_id = v_org) then
    raise exception 'share requires a TalentOps engagement of the workspace''s organization' using errcode = '23514';
  end if;
  if new.board_id is not null and not exists (select 1 from public.workspace_boards b
                                               where b.id = new.board_id and b.workspace_id = new.workspace_id) then
    raise exception 'board belongs to another workspace' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.workspace_shares_consistency() from public, anon, authenticated;
create trigger workspace_shares_consistency before insert or update on public.workspace_shares
  for each row execute function public.workspace_shares_consistency();
create trigger workspace_shares_audit after insert or update or delete on public.workspace_shares
  for each row execute function public.audit_workspace_config();

----------------------------------------------------------------------
-- The one place. Member of an entitled organization → full reach. BES staff →
-- only through a live, unrevoked share, only within the BES TalentOps scope,
-- only the shared board (p_board null asks "any share at all", for the
-- container). p_need_work = true additionally requires access 'work'.
----------------------------------------------------------------------
create or replace function public.workspace_reach(p_ws uuid, p_board uuid, p_need_work boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and public.is_org_member(w.organization_id)
         and public.org_entitled(w.organization_id, 'workspaces'))
  or exists (
      select 1
        from public.workspace_shares s
        join public.workspaces w on w.id = s.workspace_id
        join public.fulfillment_engagements e on e.id = s.engagement_id
       where s.workspace_id = p_ws
         and s.revoked_at is null
         and (p_board is null or s.board_id is null or s.board_id = p_board)
         and (not p_need_work or s.access = 'work')
         and e.service = 'talentops'
         and e.organization_id = w.organization_id
         and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
         and public.is_staff_of(e.agency_id)
         and public.in_scope(e.agency_id, 'talentops', null, null, null))
$$;
revoke execute on function public.workspace_reach(uuid, uuid, boolean) from public, anon;
grant execute on function public.workspace_reach(uuid, uuid, boolean) to authenticated;

-- Re-point the policies from 0028.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.workspace_reach(id, null));

drop policy if exists workspace_boards_select on public.workspace_boards;
create policy workspace_boards_select on public.workspace_boards for select to authenticated
  using (public.workspace_reach(workspace_id, id));

drop policy if exists work_items_select on public.work_items;
create policy work_items_select on public.work_items for select to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
      or (scope = 'AGENCY' and subject_organization_id is not null and public.is_org_admin(subject_organization_id))
    )
  );

drop policy if exists work_items_update on public.work_items;
create policy work_items_update on public.work_items for update to authenticated
  using (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true))
    and (
      (public.is_staff_of(agency_id) and (scope = 'AGENCY' or public.bes_engaged_with(organization_id))
        and public.in_scope(agency_id, division, team_id, assigned_to, created_by))
      or (scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, assigned_to))
    )
  )
  with check (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true))
    and (team_id is null or exists (select 1 from public.teams t where t.id = work_items.team_id and t.archived_at is null
                                      and (t.agency_id = work_items.agency_id or t.organization_id = work_items.organization_id)))
    and (assigned_to is null or assigned_to = auth.uid() or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
         or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id)))
  );

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert on public.work_items for insert to authenticated
  with check (
    (workspace_id is null or public.workspace_reach(workspace_id, board_id, true))
    and (
      assigned_to = auth.uid()
      or public.is_manager_of(agency_id) or public.is_team_lead_of(team_id)
      or (scope = 'ORGANIZATION' and public.is_org_admin(organization_id))
      or (assigned_to is null and public.is_staff_of(agency_id) and public.in_scope(agency_id, division, team_id, null, null))
      or (assigned_to is null and scope = 'ORGANIZATION' and public.org_scope_allows(organization_id, null))
    )
    and (
      (scope = 'AGENCY' and public.is_staff_of(agency_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and public.is_org_member(organization_id) and agency_id = public.org_agency(organization_id))
      or (scope = 'ORGANIZATION' and organization_id is not null and division is not null and public.is_staff_of(agency_id) and public.bes_may_fulfil(organization_id, null, division))
      -- BES working a shared workspace item: the share is the authorization.
      or (scope = 'ORGANIZATION' and workspace_id is not null and public.is_staff_of(agency_id) and agency_id = public.org_agency(organization_id))
    )
  );

-- Shares: the organization authorizes; BES may read the share it benefits from;
-- nobody deletes (revoke). BES cannot create a share for itself.
alter table public.workspace_shares enable row level security;
revoke all on public.workspace_shares from public, anon;
grant select, insert, update on public.workspace_shares to authenticated;

create policy workspace_shares_select on public.workspace_shares for select to authenticated
  using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_member(w.organization_id))
    or exists (select 1 from public.fulfillment_engagements e where e.id = engagement_id and public.is_staff_of(e.agency_id)
                 and public.in_scope(e.agency_id, 'talentops', null, null, null))
  );
create policy workspace_shares_insert on public.workspace_shares for insert to authenticated
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.organization_id)
                        and public.org_entitled(w.organization_id, 'workspaces')));
create policy workspace_shares_update on public.workspace_shares for update to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.organization_id)))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.organization_id)));

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

----------------------------------------------------------------------
-- Fixtures: Lakeside hires BES for TalentOps and shares the whole fixture
-- workspace. Northgate has neither (negative control).
----------------------------------------------------------------------
insert into public.fulfillment_engagements (id, agency_id, organization_id, service, status, effective_from, authorized_team)
values ('dddddddd-0000-4000-8000-000000000701', 'a0000000-0000-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-80ce8814eb05', 'talentops', 'active', '2026-06-01', 'TalentOps')
on conflict do nothing;
insert into public.workspace_shares (id, workspace_id, engagement_id, board_id, access)
values ('ee000000-0000-4000-8000-000000000051', 'ee000000-0000-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000701', null, 'work')
on conflict do nothing;
