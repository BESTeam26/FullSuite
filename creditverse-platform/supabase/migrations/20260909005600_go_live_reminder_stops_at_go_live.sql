-- =============================================================================
-- The go-live reminder stops at go-live.
--
-- Caught by the 0293 probe "a launched project does not": a project whose
-- went_live_at is set but which has no work units derives its journey as
-- 'info_gathering' (crm_project_journey: no units → info gathering, before
-- it ever looks at went_live_at), so the sweep kept telling its lead the
-- go-live date had passed. Dee's §10 is the rule: go-live is an event with a
-- time. Once it has happened, the target date is history. One condition
-- added; the function is restated in full because `create or replace` is a
-- rewrite (the 0034 lesson).
-- =============================================================================

create or replace function public.due_date_sweep()
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  v_n integer := 0;
  v_c integer;
begin
  /* ── A. Agency work due within 24 hours → the assignee, once. ──────────
     Agency-scoped work only (the BES team, the live-operations P0):
     notifications.agency_id is NOT NULL and an organization's own work
     carries no agency, so it is out of this sweep by construction. */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select w.assigned_to, w.agency_id, null, 'due_soon', 'work_item', w.id::text, w.title, 'bes_internal',
         'Due soon',
         w.title || ' is due ' || to_char(w.due_at, 'Mon FMDD') || '.'
    from public.work_items w
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.assigned_to is not null
     and w.due_at > now() and w.due_at <= now() + interval '24 hours'
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = w.assigned_to and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'due_soon');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── B. Agency work overdue → the assignee, at most once a day. ──────── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select w.assigned_to, w.agency_id, null, 'overdue', 'work_item', w.id::text, w.title, 'bes_internal',
         'Overdue',
         w.title || ' was due ' || to_char(w.due_at, 'Mon FMDD') || '.'
    from public.work_items w
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.assigned_to is not null
     and w.due_at < now()
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = w.assigned_to and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'overdue'
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── C. …and its team's leads, the authorized escalation recipient. ──── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select tm.user_id, w.agency_id, null, 'overdue', 'work_item', w.id::text, w.title, 'bes_internal',
         'Overdue on your team',
         w.title || ' was due ' || to_char(w.due_at, 'Mon FMDD')
           || coalesce(' — ' || nullif(trim(pr.full_name), ''), '') || '.'
    from public.work_items w
    join public.team_memberships tm on tm.team_id = w.team_id and tm.is_lead
    left join public.profiles pr on pr.id = w.assigned_to
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.due_at < now()
     and tm.user_id is distinct from w.assigned_to
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = tm.user_id and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'overdue'
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── D. A CRM go-live inside seven days, or passed, while the project is
         still being built → the project lead and the team's leads, daily.
         Launch, support and complete are past the date by definition. ── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select r.recipient, p.agency_id, null,
         case when p.target_go_live < current_date then 'overdue' else 'due_soon' end,
         'crm_project', p.id::text, p.name, 'bes_internal',
         case when p.target_go_live < current_date then 'Go-live date passed'
              else 'Go-live in ' || (p.target_go_live - current_date) || ' day'
                   || case when p.target_go_live - current_date = 1 then '' else 's' end end,
         p.name || coalesce(' — ' || p.business_name, '') || ' targets ' || to_char(p.target_go_live, 'Mon FMDD') || '.'
    from public.crm_projects p
    cross join lateral (
      select p.lead_id as recipient where p.lead_id is not null
      union
      select tm.user_id from public.team_memberships tm where tm.team_id = p.team_id and tm.is_lead
    ) r
   where p.archived_at is null
     and p.target_go_live is not null
     and p.target_go_live <= current_date + 7
     /* §10: go-live is an EVENT with a time. Once it has happened the target
        date is history, whatever the journey derives — a project with no
        units yet reads "info gathering" even after went_live_at is set. */
     and p.went_live_at is null
     and public.crm_project_journey(p.id) not in ('launch', 'support', 'complete')
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = r.recipient and n.entity_type = 'crm_project'
                        and n.entity_id = p.id::text and n.kind in ('due_soon', 'overdue')
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return v_n;
end $function$;

revoke execute on function public.due_date_sweep() from public, anon, authenticated;
