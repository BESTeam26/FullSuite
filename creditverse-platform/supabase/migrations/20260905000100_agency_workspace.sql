-- 0142 — BES's own team can finally hold its own work.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS IN THE WAY
--
-- The register says "Custom Workspaces — done", and for a customer it is. For
-- the BES team it was unreachable, for two reasons that both had to go:
--
--   workspaces.organization_id is NOT NULL, so every workspace belongs to a
--   customer Organization. BES HQ is not one, and inventing an Organization
--   to hold BES's internal work would put internal work inside the tenant
--   boundary — the one thing rule 16 exists to prevent.
--
--   work_items_workspace_consistency() requires scope = 'ORGANIZATION' on any
--   item that belongs to a workspace. An AGENCY item could never join one.
--
-- So a BES manager had nowhere to put a task that is not about a customer.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- A workspace now belongs to EXACTLY ONE of an organization or an agency, and
-- the whole existing engine — boards, statuses, item types, custom fields,
-- work_items, activity, production, EOD — works for both. There is no second
-- task engine, no `agency_tasks` table, and no parallel permission system
-- (rules 2, 5, 17).
--
-- Two child tables are added because a usable task needs them and neither
-- exists anywhere yet: a checklist, and a blocker link between items. Both
-- hang off work_items and inherit its authorization rather than declaring
-- their own.
-- ---------------------------------------------------------------------------

-- ── A workspace belongs to a customer OR to the agency ───────────────────
alter table public.workspaces
  alter column organization_id drop not null,
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade;

alter table public.workspaces
  add constraint workspaces_owner_ck check (
    (organization_id is not null and agency_id is null) or
    (organization_id is null and agency_id is not null)
  );

create index if not exists workspaces_agency_idx on public.workspaces (agency_id) where agency_id is not null;

comment on column public.workspaces.agency_id is
  'Set for a BES-internal workspace. Exactly one of organization_id / agency_id is set: a workspace is a customer''s or the agency''s, never both and never neither.';

-- ── Visibility: the customer chain, or the agency staff chain ────────────
--
-- An agency workspace is NOT entitlement-gated. `org_entitled` asks whether a
-- CUSTOMER purchased Custom Workspaces; BES running its own operations is not
-- a purchase, and routing it through a customer's entitlement would make BES's
-- internal tooling depend on a customer's plan.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (
    (organization_id is not null
      and public.is_org_member(organization_id)
      and public.org_entitled(organization_id, 'workspaces'))
    or (agency_id is not null and public.is_staff_of(agency_id))
  );

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (
    (organization_id is not null
      and public.is_org_admin(organization_id)
      and public.org_entitled(organization_id, 'workspaces'))
    or (agency_id is not null and public.is_agency_manager_or_above())
  );

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (
    (organization_id is not null
      and public.is_org_admin(organization_id)
      and public.org_entitled(organization_id, 'workspaces'))
    or (agency_id is not null and public.is_agency_manager_or_above())
  )
  with check (
    (organization_id is not null
      and public.is_org_admin(organization_id)
      and public.org_entitled(organization_id, 'workspaces'))
    or (agency_id is not null and public.is_agency_manager_or_above())
  );

-- ── Configuration rows follow their workspace's owner ────────────────────
do $$
declare t text;
begin
  foreach t in array array['workspace_boards', 'workspace_statuses', 'workspace_item_types', 'workspace_fields'] loop
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format($f$
      create policy %1$s_write on public.%1$s for insert to authenticated
        with check (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id
          and ((w.organization_id is not null and public.is_org_admin(w.organization_id))
            or (w.agency_id is not null and public.is_agency_manager_or_above()))));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id
          and ((w.organization_id is not null and public.is_org_admin(w.organization_id))
            or (w.agency_id is not null and public.is_agency_manager_or_above()))))
        with check (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id
          and ((w.organization_id is not null and public.is_org_admin(w.organization_id))
            or (w.agency_id is not null and public.is_agency_manager_or_above()))));
      create policy %1$s_delete on public.%1$s for delete to authenticated
        using (exists (select 1 from public.workspaces w where w.id = %1$s.workspace_id
          and ((w.organization_id is not null and public.is_org_admin(w.organization_id))
            or (w.agency_id is not null and public.is_agency_manager_or_above()))));
    $f$, t);
  end loop;
end $$;

-- ── An AGENCY item may belong to an AGENCY workspace ─────────────────────
--
-- Same shape as before, with the owner checked against the item's own scope.
-- An organization item still belongs to its organization's workspace; an
-- agency item belongs to its agency's. Neither can reach the other's.
create or replace function public.work_items_workspace_consistency()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ws_org    uuid;
  v_ws_agency uuid;
  v_found     boolean;
  v_stage     public.work_stage;
begin
  if new.workspace_id is null then
    if new.board_id is not null or new.status_id is not null or new.item_type_id is not null then
      raise exception 'board, status and item type require a workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  select true, w.organization_id, w.agency_id
    into v_found, v_ws_org, v_ws_agency
    from public.workspaces w
   where w.id = new.workspace_id and w.archived_at is null;
  if not coalesce(v_found, false) then
    raise exception 'workspace not found or archived' using errcode = '23514';
  end if;

  if v_ws_org is not null then
    if new.scope is distinct from 'ORGANIZATION' or new.organization_id is distinct from v_ws_org then
      raise exception 'a workspace item belongs to the workspace''s organization' using errcode = '23514';
    end if;
  else
    /* An agency workspace holds AGENCY work, and only this agency's. The
       organization column stays null, which is what keeps internal work
       outside every tenant boundary. */
    if new.scope is distinct from 'AGENCY' or new.organization_id is not null then
      raise exception 'an agency workspace holds agency work' using errcode = '23514';
    end if;
    if new.agency_id is distinct from v_ws_agency then
      raise exception 'a workspace item belongs to the workspace''s agency' using errcode = '23514';
    end if;
  end if;

  if new.board_id is not null and not exists (select 1 from public.workspace_boards b where b.id = new.board_id and b.workspace_id = new.workspace_id) then
    raise exception 'board belongs to another workspace' using errcode = '23514';
  end if;
  if new.item_type_id is not null and not exists (select 1 from public.workspace_item_types t where t.id = new.item_type_id and t.workspace_id = new.workspace_id) then
    raise exception 'item type belongs to another workspace' using errcode = '23514';
  end if;

  if new.status_id is null then
    select s.id into new.status_id from public.workspace_statuses s
     where s.workspace_id = new.workspace_id order by s.position, s.key limit 1;
  end if;
  select s.canonical_stage into v_stage from public.workspace_statuses s
   where s.id = new.status_id and s.workspace_id = new.workspace_id;
  if v_stage is null then
    raise exception 'status belongs to another workspace' using errcode = '23514';
  end if;
  new.stage := v_stage;
  if v_stage = 'Completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.work_items_workspace_consistency() from public, anon, authenticated;

-- ── A checklist, which no work item has ever had ─────────────────────────
create table public.work_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  label        text not null check (length(trim(label)) between 1 and 300),
  done         boolean not null default false,
  position     integer not null default 0,
  done_by      uuid references public.profiles(id) on delete set null,
  done_at      timestamptz,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index work_checklist_item_idx on public.work_checklist_items (work_item_id, position);
create trigger work_checklist_items_updated_at before update on public.work_checklist_items
  for each row execute function public.set_updated_at();

/* Who ticked it, and when. Stamped by the database so a client cannot
   attribute a tick to somebody else (rule 10). */
create or replace function public.work_checklist_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or old.done is distinct from true) then
    new.done_by := auth.uid();
    new.done_at := now();
  elsif not new.done then
    new.done_by := null;
    new.done_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.work_checklist_stamp() from public, anon, authenticated;
create trigger work_checklist_stamp before insert or update on public.work_checklist_items
  for each row execute function public.work_checklist_stamp();

-- ── What is blocking what ────────────────────────────────────────────────
create table public.work_item_blockers (
  id            uuid primary key default gen_random_uuid(),
  work_item_id  uuid not null references public.work_items(id) on delete cascade,
  /** The item that must finish first. Null when the blocker is a note. */
  blocked_by_id uuid references public.work_items(id) on delete cascade,
  /** Why, in a person's words. Required when no item is named. */
  note          text,
  resolved_at   timestamptz,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint work_item_blockers_self_ck check (blocked_by_id is null or blocked_by_id <> work_item_id),
  constraint work_item_blockers_reason_ck check (
    blocked_by_id is not null or (note is not null and length(trim(note)) >= 3)
  ),
  unique (work_item_id, blocked_by_id)
);
create index work_item_blockers_item_idx on public.work_item_blockers (work_item_id) where resolved_at is null;
create index work_item_blockers_by_idx on public.work_item_blockers (blocked_by_id) where resolved_at is null;

-- ── Both inherit the work item's authorization. No parallel model. ───────
alter table public.work_checklist_items enable row level security;
alter table public.work_item_blockers   enable row level security;
revoke all on public.work_checklist_items, public.work_item_blockers from public, anon;
grant select, insert, update, delete on public.work_checklist_items to authenticated;
grant select, insert, update, delete on public.work_item_blockers   to authenticated;

/**
 * May the caller CHANGE this work item?
 *
 * The same expression `work_items_update` uses, in one place. The child tables
 * below need it, and copying the expression into their policies would leave
 * four copies to drift apart — a checklist that stays writable after the rule
 * on its parent tightens is a silent hole.
 *
 * SECURITY DEFINER so it can read the row at all, but it re-applies the
 * authorization itself rather than inheriting the caller's visibility: seeing
 * a task and being allowed to change it are different questions.
 */
create or replace function public.can_write_work_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_items w
     where w.id = p_item
       and ((public.is_staff_of(w.agency_id)
             and public.in_scope(w.agency_id, w.division, w.team_id, w.assigned_to, w.created_by))
         or (w.scope = 'ORGANIZATION' and public.org_scope_allows(w.organization_id, w.assigned_to)))
  )
$$;
revoke execute on function public.can_write_work_item(uuid) from public, anon;
grant execute on function public.can_write_work_item(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['work_checklist_items', 'work_item_blockers'] loop
    /* SELECT rides the parent's visibility: `exists (select 1 from work_items …)`
       runs under the CALLER's rights, so work_items_select decides it exactly.
       WRITES ride `can_write_work_item`, which is the same expression
       work_items_update uses. Seeing a task and being allowed to tick its
       boxes are different questions, and the database answers both the same
       way it answers them for the task itself. */
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (exists (select 1 from public.work_items w where w.id = %1$s.work_item_id));
      create policy %1$s_insert on public.%1$s for insert to authenticated
        with check (public.can_write_work_item(%1$s.work_item_id));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (public.can_write_work_item(%1$s.work_item_id))
        with check (public.can_write_work_item(%1$s.work_item_id));
      create policy %1$s_delete on public.%1$s for delete to authenticated
        using (public.can_write_work_item(%1$s.work_item_id));
    $f$, t);
  end loop;
end $$;

comment on table public.work_checklist_items is
  'A work item''s checklist. Authorization is the work item''s own — no tenancy column here, deliberately.';
comment on table public.work_item_blockers is
  'What is holding a work item up: another item, or a note. Resolved rather than deleted, so the history of what blocked what survives.';
