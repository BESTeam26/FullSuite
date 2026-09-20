-- Admin and meetings are internal, not divisions.
--
-- Dee, 2026-09-20: "Admin and meetings are all internal and no tasks really."
--
-- They are timer buckets, not places in the company, and the report was
-- listing them beside CreditOps and BES CRM as though they were peers. An hour
-- booked to admin by somebody who HAS a department already lands in their
-- division — the department decides that (20260920007400) — so what is left
-- here is genuinely unattached internal time, and it now says so.
--
-- `sales_marketing` gets the same treatment for the opposite reason: it is a
-- division that no longer exists, and showing its raw key invites somebody to
-- go looking for a division that was retired.

create or replace view public.report_facts_scoped as
  select f.*,
         coalesce(dep.division_id, dvs.id) as division_id,
         coalesce(
           dep.division_name,
           dvs.name,
           case f.service
             when 'admin'   then 'Internal'
             when 'meeting' then 'Internal'
             else null
           end,
           /* A retired or unknown key, read as words rather than as a key. */
           initcap(replace(coalesce(f.service, '—'), '_', ' '))
         ) as division,
         dep.id as department_id,
         case
           when dep.id is not null then dep.name || ' · ' || dep.division_name
           when f.department is not null then f.department
           when f.service in ('admin', 'meeting') then initcap(f.service)
           else '—'
         end as department_scoped
    from public.report_facts f
    left join public.divisions dvs
      on dvs.archived_at is null and dvs.service::text = f.service
    left join lateral (
      select d.id, d.name, d.division_id, dv.name as division_name
        from public.departments d
        join public.divisions dv on dv.id = d.division_id and dv.archived_at is null
       where d.archived_at is null
         and f.department is not null
         and (lower(d.key) = lower(f.department) or lower(d.name) = lower(f.department))
       order by (dv.service::text = f.service) desc,
                (lower(d.key) = lower(f.department)) desc,
                d.name
       limit 1
    ) dep on true;

comment on view public.report_facts_scoped is
  'report_facts with the department resolved to one row and the division taken FROM that department. Admin and meeting time that belongs to no department reads as Internal, not as a division.';
revoke all on public.report_facts_scoped from public, anon;
grant select on public.report_facts_scoped to authenticated;
