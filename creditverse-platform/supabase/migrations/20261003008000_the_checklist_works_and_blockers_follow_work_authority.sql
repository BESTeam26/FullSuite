-- The CreditOps checklist works, and blockers follow work authority.
--
-- 1. client_work_checklist was unusable for EVERYONE. Its policies (written
--    2026-09-12, 20260912001100) said `exists (select 1 from
--    fulfillment_clients c where c.id = client_id)` — unqualified. When
--    fulfillment_clients later gained its own `client_id` column (the link to
--    the canonical clients directory), that name resolved to the INNER table:
--    "a client whose id equals its own client_id", true for no row. So no
--    caller could read or tick a step; each open of a file re-applied the
--    template through the definer (486 invisible steps on 70 clients) and the
--    screen said "No standard steps are configured". The same class as the
--    storage `name` incident of 2026-10-02: qualify the column.
--
--    Now: read when you can see the client; change (tick, add, remove) only
--    when you work that department — creditops_may_work, the rule
--    set_client_department_status already uses — or are a member of the
--    organization that owns the client.
--
--    And the table had never been granted for writing: `authenticated` held
--    SELECT only, so even a correct policy refused every tick. Granted
--    narrowly: insert a custom step (client, department, label, order —
--    marked custom and stamped with its author by default), update `done`
--    only (the trigger stamps who and when), delete a custom step that is not
--    finalized. Standard template steps cannot be deleted by hand.
--
-- 2. report_work_blocker accepted any staff member for any department; only
--    the button was hidden. It now asks the same work-authority question.
--
-- Cost impact: none — and one fewer write per file open, since a visible
-- checklist no longer looks empty and re-triggers the template.

begin;

drop policy if exists client_work_checklist_select on public.client_work_checklist;
drop policy if exists client_work_checklist_write on public.client_work_checklist;

create policy client_work_checklist_select on public.client_work_checklist for select to authenticated
using (exists (select 1 from public.fulfillment_clients c where c.id = client_work_checklist.client_id));

create policy client_work_checklist_insert on public.client_work_checklist for insert to authenticated
with check (exists (select 1 from public.fulfillment_clients c
                     where c.id = client_work_checklist.client_id
                       and (public.creditops_may_work(client_work_checklist.department) or public.is_org_member(c.organization_id))));

create policy client_work_checklist_update on public.client_work_checklist for update to authenticated
using (client_work_checklist.finalized_at is null and exists (select 1 from public.fulfillment_clients c
                where c.id = client_work_checklist.client_id
                  and (public.creditops_may_work(client_work_checklist.department) or public.is_org_member(c.organization_id))))
with check (exists (select 1 from public.fulfillment_clients c
                     where c.id = client_work_checklist.client_id
                       and (public.creditops_may_work(client_work_checklist.department) or public.is_org_member(c.organization_id))));

create policy client_work_checklist_delete on public.client_work_checklist for delete to authenticated
using (client_work_checklist.is_custom and client_work_checklist.finalized_at is null
       and exists (select 1 from public.fulfillment_clients c
                where c.id = client_work_checklist.client_id
                  and (public.creditops_may_work(client_work_checklist.department) or public.is_org_member(c.organization_id))));

/* A step somebody adds by hand is custom and theirs; the template inserts
   (definer) name is_custom = false explicitly, so they are unaffected. */
alter table public.client_work_checklist alter column is_custom set default true;
alter table public.client_work_checklist alter column added_by set default auth.uid();

grant insert (client_id, department, label, sort) on public.client_work_checklist to authenticated;
grant update (done) on public.client_work_checklist to authenticated;
grant delete on public.client_work_checklist to authenticated;

CREATE OR REPLACE FUNCTION public.report_work_blocker(p_client uuid, p_department fulfillment_department, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.fulfillment_clients%rowtype;
  v_prev text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_who text;
begin
  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then raise exception 'Client not visible' using errcode = '42501'; end if;
  /* The same work authority as changing the department's status
     (creditops_may_work): seeing a file is not working it (20261003008000). */
  if not (public.creditops_may_work(p_department) or public.is_org_member(c.organization_id)) then
    raise exception 'You do not work the % queue, so you cannot report a blocker on it', p_department
      using errcode = '42501';
  end if;

  select blocked_reason into v_prev from public.client_department_statuses
   where client_id = p_client and department = p_department;
  if not found then
    raise exception 'There is no % work open on this client', p_department using errcode = '22023';
  end if;
  if v_prev is not distinct from v_reason then return; end if;

  update public.client_department_statuses
     set blocked_reason = v_reason,
         blocked_by = case when v_reason is null then null else auth.uid() end,
         blocked_at = case when v_reason is null then null else now() end,
         updated_at = now()
   where client_id = p_client and department = p_department;

  select coalesce(full_name, email) into v_who from public.profiles where id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (c.agency_id, c.organization_id, 'fulfillment_client', p_client::text, auth.uid(), v_who,
     case when v_reason is null then 'Blocker cleared' else 'Blocker reported' end,
     coalesce(v_reason, 'This file is workable again.'),
     'blocker:' || p_department::text, v_prev, v_reason, 'bes_internal');
end $function$;

commit;
