-- A partner sees their build's progress and the milestones BES published
-- (Dee, 2026-10-01, PARTNER_PORTAL_DOCTRINE.md, Projects & Services: "what
-- BES is doing for them … any builds/projects · start date · progress ·
-- milestones · deliverables · approvals needed").
--
-- Two partner-scoped readers, both behind partner_group_of_user() — the same
-- gate as every my_partner_* function (off means off: suspended or portal
-- switched off returns nothing):
--
--   my_partner_project_engines()  per build engine: how many units, how many
--                                 done, the percentage, and a partner-facing
--                                 stage. The SAME count the project's own
--                                 progress uses (work units completed of
--                                 work units, cancelled engines excluded) —
--                                 counts only: never a unit's title, owner,
--                                 QA verdict or internal note.
--   my_partner_milestones()       only milestones BES marked client_visible
--                                 ("association is not publication", rule
--                                 17): label, engine, scheduled and completed
--                                 dates, and the delivery link if BES gave one.
--                                 Never notes or who completed it.

create or replace function public.my_partner_project_engines()
returns table(project_id uuid, engine_key text, label text, units integer, completed integer,
              percent integer, stage text)
language sql stable security definer set search_path = public as $$
  select e.project_id, e.engine_key, en.label,
         count(w.id)::int,
         count(w.id) filter (where w.completed_at is not null)::int,
         case when count(w.id) = 0 then null
              else round(100.0 * count(w.id) filter (where w.completed_at is not null) / count(w.id))::int end,
         case when count(w.id) = 0 then 'not_started'
              when count(w.id) filter (where w.completed_at is null) = 0 then 'complete'
              when count(w.id) filter (where w.completed_at is not null) = 0 then 'not_started'
              else 'in_progress' end
    from public.crm_projects p
    join public.crm_project_engines e on e.project_id = p.id and e.cancelled_at is null
    join public.crm_engines en on en.key = e.engine_key
    left join public.work_items w
      on w.crm_project_id = p.id and w.crm_engine_key = e.engine_key and w.archived_at is null
   where p.partner_group_id = public.partner_group_of_user()
     and p.archived_at is null
   group by e.project_id, e.engine_key, en.label, en.sort
   order by e.project_id, en.sort
$$;

create or replace function public.my_partner_milestones()
returns table(id uuid, project_id uuid, label text, engine_label text,
              scheduled_at timestamptz, completed_at timestamptz, link_url text)
language sql stable security definer set search_path = public as $$
  select m.id, m.project_id, m.label, en.label, m.scheduled_at, m.completed_at, m.link_url
    from public.crm_milestones m
    join public.crm_projects p on p.id = m.project_id
    left join public.crm_engines en on en.key = m.engine_key
   where p.partner_group_id = public.partner_group_of_user()
     and p.archived_at is null
     and m.client_visible
   order by m.project_id, m.completed_at nulls last, m.scheduled_at nulls last, m.sort
$$;

revoke execute on function public.my_partner_project_engines() from anon, public;
revoke execute on function public.my_partner_milestones() from anon, public;
grant execute on function public.my_partner_project_engines() to authenticated;
grant execute on function public.my_partner_milestones() to authenticated;
