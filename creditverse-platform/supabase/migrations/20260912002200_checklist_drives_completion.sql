-- =============================================================================
-- The checklist IS the work record. Complete Work finalizes it.
--
-- Dee, 2026-09-12: "The checklist and Complete Work drawer must talk to each
-- other… They should not be two separate data-entry systems."
--
-- Three things this adds:
--
--   required        a standard action that must be done before the work can be
--                   finalized. Not a suggestion — the finaliser refuses.
--   is_custom       a step the agent added for this file, kept apart from the
--                   standard template so one client's oddity never becomes
--                   everybody's SOP.
--   added_by        who added a custom step, recorded when they add it.
--
-- ── UNCHECKING AFTER FINALISATION ──────────────────────────────────────────
--
-- Dee: "Unchecking/correcting a completed action should follow an audited
-- correction path rather than silently deleting history if it has already been
-- finalized." So a step that was part of a finalised completion is frozen: the
-- trigger refuses to un-tick it, and the correction is a new completion or a
-- note, both of which leave a trail. Before finalisation an agent may tick and
-- un-tick freely — that is just working.
-- =============================================================================

alter table public.client_work_checklist
  add column if not exists required boolean not null default false,
  add column if not exists is_custom boolean not null default false,
  add column if not exists added_by uuid references public.profiles(id),
  /** Set when a completion finalised this step. Frozen from then on. */
  add column if not exists finalized_at timestamptz;

comment on column public.client_work_checklist.required is
  'A standard action that must be done before Complete Work will finalise. An agent who cannot do it uses Report Blocker, not the drawer (Dee, 2026-09-12).';
comment on column public.client_work_checklist.finalized_at is
  'Set when a completion recorded this step. A finalised step cannot be un-ticked — the correction is a new completion or a note, both of which leave a trail.';

create or replace function public.client_work_checklist_touch()
returns trigger language plpgsql set search_path = public as $function$
begin
  new.updated_at := now();
  if new.done and not coalesce(old.done, false) then
    new.done_by := auth.uid(); new.done_at := now();
  elsif not new.done and coalesce(old.done, false) then
    if old.finalized_at is not null then
      raise exception 'That step was recorded in a completion. Post a correction or complete the work again rather than un-ticking it.'
        using errcode = '22023';
    end if;
    new.done_by := null; new.done_at := null;
  end if;
  return new;
end $function$;

/* The template's required flag travels with the step. */
create or replace function public.creditops_apply_checklist_template(
  p_client uuid, p_department public.fulfillment_department
) returns int
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_status text;
  v_added int := 0;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null or not public.is_staff_of(c.agency_id) then return 0; end if;

  select status into v_status from public.client_department_statuses
   where client_id = p_client and department = p_department;
  if v_status is null then return 0; end if;

  with chosen as (
    select t.* from public.creditops_checklist_templates t
     where t.agency_id = c.agency_id and t.department = p_department and t.active
       and t.work_status is not distinct from (
         select case when exists (
           select 1 from public.creditops_checklist_templates s
            where s.agency_id = c.agency_id and s.department = p_department
              and s.active and upper(s.work_status) = upper(v_status)
         ) then v_status else null end)
  ), inserted as (
    insert into public.client_work_checklist (client_id, department, label, sort, required, is_custom)
    select p_client, p_department, ch.label, ch.sort, ch.required, false from chosen ch
     where not exists (
       select 1 from public.client_work_checklist w
        where w.client_id = p_client and w.department = p_department and w.label = ch.label)
    returning 1
  )
  select count(*)::int into v_added from inserted;
  return v_added;
end $function$;

-- ── What the drawer already knows ───────────────────────────────────────────
/**
 * What has been ticked, and whether the work may be finalised.
 *
 * The drawer opens from this rather than asking the agent to select the work
 * they just did. Dee: "Do NOT make the agent select or type them again."
 */
create or replace function public.creditops_completion_state(
  p_client uuid, p_department public.fulfillment_department
) returns table (completed text[], outstanding_required text[], may_finalize boolean)
language sql stable security definer set search_path = public as $function$
  with steps as (
    select label, done, required from public.client_work_checklist
     where client_id = p_client and department = p_department
  )
  select
    coalesce((select array_agg(label order by label) from steps where done), '{}'),
    coalesce((select array_agg(label order by label) from steps where required and not done), '{}'),
    not exists (select 1 from steps where required and not done)
$function$;
revoke execute on function public.creditops_completion_state(uuid, public.fulfillment_department) from public, anon;
grant execute on function public.creditops_completion_state(uuid, public.fulfillment_department) to authenticated;

-- ── Finalising ──────────────────────────────────────────────────────────────
/**
 * Freeze the ticked steps against this completion, and refuse when required
 * work is outstanding.
 *
 * `p_override_reason` is the Team Lead's explicit, audited way past it — Dee:
 * "Team Lead/Admin override can exist if needed, but must be explicit and
 * audited." An agent cannot supply one; `ops.manage` can, and it is recorded.
 */
create or replace function public.creditops_finalize_checklist(
  p_client uuid,
  p_department public.fulfillment_department,
  p_override_reason text default null
) returns text[]
language plpgsql security definer set search_path = public as $function$
declare
  v_outstanding text[];
  v_done text[];
  v_who text;
  c public.fulfillment_clients%rowtype;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null or not public.is_staff_of(c.agency_id) then
    raise exception 'Client not visible' using errcode = '42501';
  end if;

  select outstanding_required, completed into v_outstanding, v_done
    from public.creditops_completion_state(p_client, p_department);

  if coalesce(array_length(v_outstanding, 1), 0) > 0 then
    if nullif(btrim(coalesce(p_override_reason, '')), '') is null then
      raise exception 'Required work is not finished: %. Finish it, or report a blocker.',
        array_to_string(v_outstanding, ', ') using errcode = '22023';
    end if;
    if not public.agency_can('ops.manage') then
      raise exception 'Only a Team Lead or管 manager can complete work with required steps outstanding'
        using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    values
      (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(), v_who,
       'Completed with required work outstanding',
       array_to_string(v_outstanding, ', ') || ' — ' || btrim(p_override_reason),
       'checklist_override', array_to_string(v_outstanding, ', '), 'overridden', 'bes_internal');
  end if;

  update public.client_work_checklist
     set finalized_at = now()
   where client_id = p_client and department = p_department and done and finalized_at is null;

  return v_done;
end $function$;
revoke execute on function public.creditops_finalize_checklist(uuid, public.fulfillment_department, text) from public, anon;
grant execute on function public.creditops_finalize_checklist(uuid, public.fulfillment_department, text) to authenticated;
