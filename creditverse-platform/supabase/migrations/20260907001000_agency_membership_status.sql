-- 0169 — a person can leave without their history leaving with them.
--
-- ---------------------------------------------------------------------------
-- Dee's rule, recorded when we first hit this: "do not solve inactive users by
-- deleting their membership or changing their role."
--
-- Both of those destroy something. Deleting the membership cascades away who
-- worked what; demoting them to agent rewrites what they were when they did
-- it. Historical attribution does not change when a current assignment does
-- (rule 4), so leaving needs its own field.
--
-- `status` is that field. An inactive member keeps their role, their history
-- and their name on every record they touched, and stops appearing anywhere a
-- CURRENT person belongs: the roster, the assignee picker, the team lists.
-- ---------------------------------------------------------------------------

alter table public.agency_memberships
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive')),
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id) on delete set null;

comment on column public.agency_memberships.status is
  'Whether this person is currently on the team. Inactive keeps the role, the membership and every record they touched — it only removes them from the places a CURRENT person belongs.';

create index if not exists agency_memberships_active_idx
  on public.agency_memberships (agency_id) where status = 'active';

/**
 * Deactivate or restore one member.
 *
 * An RPC rather than a plain update so the actor and the moment are recorded
 * without a caller having to remember, and so the two rules that matter are in
 * one place: an owner cannot be deactivated, and nobody can deactivate
 * themselves — which is how an agency ends up with no active owner.
 */
create or replace function public.set_agency_member_status(
  p_membership uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_actor text;
begin
  select m.agency_id, m.role, m.user_id into v_agency, v_role, v_user
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Status must be active or inactive';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change who is active';
  end if;
  if v_role = 'agency_owner' and p_status = 'inactive' then
    raise exception 'An agency owner cannot be deactivated. Change the role first, deliberately.';
  end if;
  if v_user = auth.uid() and p_status = 'inactive' then
    raise exception 'You cannot deactivate yourself';
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  update public.agency_memberships
     set status = p_status,
         deactivated_at = case when p_status = 'inactive' then now() else null end,
         deactivated_by = case when p_status = 'inactive' then auth.uid() else null end
   where id = p_membership;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          case when p_status = 'inactive' then 'Member deactivated' else 'Member restored' end,
          'status', case when p_status = 'inactive' then 'active' else 'inactive' end,
          p_status, 'bes_internal');
end;
$function$;
revoke execute on function public.set_agency_member_status(uuid, text) from public, anon;
grant execute on function public.set_agency_member_status(uuid, text) to authenticated;

/**
 * Change somebody's role, with the one rule that keeps an agency reachable.
 *
 * The last active owner cannot be demoted. Everything else an admin may do,
 * and every change is recorded — a role is what somebody is allowed to do
 * NOW, and history keeps what they were when they did the work.
 */
create or replace function public.set_agency_member_role(
  p_membership uuid,
  p_role       public.agency_role
)
returns void
language plpgsql
security definer
set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_user uuid; v_actor text; v_owners int;
begin
  select m.agency_id, m.role, m.user_id into v_agency, v_role, v_user
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change a role';
  end if;

  if v_role = 'agency_owner' and p_role <> 'agency_owner' then
    select count(*) into v_owners from public.agency_memberships
     where agency_id = v_agency and role = 'agency_owner' and status = 'active';
    if v_owners <= 1 then
      raise exception 'This is the last active owner. Make somebody else an owner first.';
    end if;
  end if;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  update public.agency_memberships
     set role = p_role, scope = public.default_scope_for_role(p_role)
   where id = p_membership;

  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          'Role changed', 'role', v_role::text, p_role::text, 'bes_internal');
end;
$function$;
revoke execute on function public.set_agency_member_role(uuid, public.agency_role) from public, anon;
grant execute on function public.set_agency_member_role(uuid, public.agency_role) to authenticated;

comment on function public.set_agency_member_role(uuid, public.agency_role) is
  'Changes what somebody may do now. Refuses to demote the last active owner, because an agency with no owner cannot appoint one. Scope follows the role, so an admin is agency-wide the moment they become one (0154).';
