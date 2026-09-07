-- 0152 — three things I broke, put back.
--
-- The full matrix caught all three. Worth recording what each was, because
-- none of them would have been obvious from the screen.
--
-- ---------------------------------------------------------------------------
-- 1. I DROPPED TWO BRANCHES OFF workspaces_select
--
-- The policy had grown three branches: the organization's own members, the
-- TalentOps share (via `workspace_reach`), and "an item in it is assigned to
-- me". Migration 0142 rewrote it from an older two-branch version and silently
-- lost the last two — so BES staff stopped seeing workspaces shared with them
-- under a live engagement, and anybody holding a task in a workspace stopped
-- seeing the workspace around it.
--
-- Restored, with the agency case handled the right way round: ordinary staff
-- see an agency workspace because work in it is theirs, and a manager sees the
-- agency's workspaces because managing them is the job. That is Dee's §20 —
-- a regular team member must not be able to browse every BES workspace.
--
-- ---------------------------------------------------------------------------
-- 2. THE SEEDING TRIGGER CHANGED BEHAVIOUR FOR EVERY EXISTING WRITER
--
-- Seeding default statuses on INSERT fixed "a new workspace cannot hold a
-- task", but it also meant an admin creating a workspace and then adding a
-- status keyed 'done' collided with the one the trigger had just made. A
-- trigger is the wrong tool: it changes the database's contract for callers
-- that were working fine. The defaults belong where workspaces are created,
-- in the application, which is where the gap actually was.
--
-- ---------------------------------------------------------------------------
-- 3. A SECURITY DEFINER FUNCTION CALLED AN RLS-DEPENDENT HELPER
--
-- `eod_run_cutoff` is DEFINER and called `eod_day_activity`, which is INVOKER
-- and reads work_items, production_logs and time_entries. Inside a DEFINER the
-- helper runs as the owner, so RLS does not apply and it reads everything.
--
-- It happens to be safe today — the helper is parameterised by employee and
-- the cutoff only ever passes the row's own employee_id. That is exactly the
-- reasoning the invariant exists to refuse: it is one careless branch away
-- from being false, and nothing would fail loudly when it stopped being true.
--
-- So the cutoff no longer snapshots. It marks the row auto-submitted with a
-- time, and the day's facts stay reconstructible from the canonical records —
-- which is the whole design. Nothing is lost: a snapshot protects against a
-- later edit changing what was reported, and for an auto-submission nobody
-- reported anything. Edits are still captured by the revision trigger.
-- ---------------------------------------------------------------------------

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (
    -- the customer's own members
    (organization_id is not null
      and public.is_org_member(organization_id)
      and public.org_entitled(organization_id, 'workspaces'))
    -- a live TalentOps share, and BES's own workspaces for a manager
    or public.workspace_reach(id, null)
    -- the container follows an item the caller can already see
    or exists (select 1 from public.work_items wi
                where wi.workspace_id = workspaces.id and wi.assigned_to = auth.uid())
  );

/* An agency workspace is visible to BES staff who MANAGE, not to everybody on
   the floor. An ordinary team member reaches it through the branch above —
   because work in it is theirs — which is Dee's §20: role + permission +
   scope + assignment, never "everyone can browse everything". */
create or replace function public.workspace_reach(
  p_ws uuid, p_board uuid, p_need_work boolean default false, p_assignee uuid default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.organization_id is not null
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
         and public.in_scope(e.agency_id, 'talentops', null, p_assignee, null))
  or exists (
      select 1 from public.workspaces w
       where w.id = p_ws
         and w.agency_id is not null
         and public.is_staff_of(w.agency_id)
         and public.is_agency_manager_or_above())
$$;
revoke execute on function public.workspace_reach(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.workspace_reach(uuid, uuid, boolean, uuid) to authenticated;

-- 2. The trigger goes; the application seeds instead.
drop trigger if exists workspace_seed_defaults on public.workspaces;
drop function if exists public.workspace_seed_defaults();

-- 3. The cutoff no longer calls an RLS-dependent helper.
create or replace function public.eod_run_cutoff(p_agency uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_cutoff  time;
  v_enabled boolean;
  v_tz      text;
  v_count   int := 0;
begin
  if not public.is_staff_of(p_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select eod_cutoff_local, eod_auto_submit, eod_timezone
    into v_cutoff, v_enabled, v_tz
    from public.agencies where id = p_agency;
  if not coalesce(v_enabled, false) or v_cutoff is null then
    return 0;
  end if;

  with due as (
    select e.id
      from public.eod_submissions e
     where e.agency_id = p_agency
       and e.submitted_at is null
       and ((e.work_date + v_cutoff) at time zone v_tz) < now()
  )
  update public.eod_submissions e
     set state          = 'submitted',
         submitted_at   = now(),
         auto_submitted = true,
         submitted_by   = null
    from due
   where e.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.eod_run_cutoff(uuid) from public, anon;
grant execute on function public.eod_run_cutoff(uuid) to authenticated;

comment on function public.eod_run_cutoff(uuid) is
  'Submits drafts left open past the agency cutoff, marked auto_submitted with no submitter named. Stores no snapshot: calling the activity helper from inside a DEFINER would run it without RLS, and the day is reconstructible from the canonical records anyway.';
