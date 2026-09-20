-- Dee's org chart, 2026-09-20: "This is how my ORG CHART SHOULD BE."
--
-- Three facts the structure table could not say:
--   parent_department_id  a department may GROUP queue departments. In
--                         CreditOps the department row is also the work queue
--                         (my_creditops_departments reads its key), so Dispute
--                         Department and Client Success Department are parents
--                         and the queues stay exactly where the engine, the
--                         seats and Archie's Complaints queue expect them.
--   functions             what a department does — the bullets on the chart.
--                         Presentation data; no team is invented to draw one.
--   show_on_chart         the FundingOps pipeline stages and Staff Management
--                         are engine rows, not org-chart departments.
-- Corporate seats are positions with a reporting line; the chart hangs the
-- operating divisions under the Chief Operating Officer.

alter table public.departments
  add column if not exists parent_department_id uuid references public.departments(id) on delete set null,
  add column if not exists functions text[] not null default '{}',
  add column if not exists show_on_chart boolean not null default true;
create index if not exists departments_parent_idx on public.departments (parent_department_id) where parent_department_id is not null;

-- A seat on a parent department covers its children.
create or replace function public.managed_departments() returns setof uuid
language sql stable security definer set search_path = public as $function$
  with direct as (
    select d.id from public.departments d
     where d.archived_at is null
       and (d.division_id in (select public.managed_divisions())
         or exists (select 1 from public.management_seats s where s.user_id = auth.uid() and s.seat = 'department_manager'
                      and s.department_id = d.id and public.seat_is_live(s.effective_from, s.effective_to))))
  select id from direct
  union
  select c.id from public.departments c where c.archived_at is null and c.parent_department_id in (select id from direct)
$function$;

do $$
declare v_agency uuid; v_credit uuid; v_talent uuid; v_funding uuid; v_crm uuid; v_corp uuid;
        v_dispute_grp uuid; v_cs_grp uuid; v_ceo uuid; v_coo uuid; v_dee uuid;
begin
  select id into v_agency from public.agencies order by created_at limit 1;
  select id into v_credit  from public.divisions where agency_id = v_agency and service = 'creditops'  and archived_at is null;
  select id into v_talent  from public.divisions where agency_id = v_agency and service = 'talentops'  and archived_at is null;
  select id into v_funding from public.divisions where agency_id = v_agency and service = 'fundingops' and archived_at is null;
  select id into v_crm     from public.divisions where agency_id = v_agency and service = 'bes_crm'    and archived_at is null;
  select id into v_corp    from public.divisions where agency_id = v_agency and tier = 'leadership'    and archived_at is null;
  select id into v_dee from public.profiles where email = 'dee@blessedempireservices.com';

  update public.divisions set description = 'Credit. People. Progress.'          where id = v_credit;
  update public.divisions set description = 'Source. Develop. Empower.'          where id = v_talent;
  update public.divisions set description = 'Capital. Systems. Opportunities.'   where id = v_funding;
  update public.divisions set description = 'Automate. Build. Scale.'            where id = v_crm;

  -- CreditOps: two chart departments grouping the queues
  insert into public.departments (agency_id, division, division_id, key, name, description, sort, functions)
  values (v_agency, 'creditops', v_credit, 'dispute_department', 'Dispute Department', 'Disputes, complaints and bureau work', 1,
          array['Dispute Processors','Complaints & Mailing','Dispute Strategy & QA','Bureau Calling','Research & Documentation'])
  on conflict do nothing;
  insert into public.departments (agency_id, division, division_id, key, name, description, sort, functions)
  values (v_agency, 'creditops', v_credit, 'client_success_department', 'Client Success Department', 'Onboarding through retention', 2,
          array['Onboarding','Client Support','Account Management','Retention & Follow Up','Client Recovery'])
  on conflict do nothing;
  select id into v_dispute_grp from public.departments where division_id = v_credit and key = 'dispute_department';
  select id into v_cs_grp      from public.departments where division_id = v_credit and key = 'client_success_department';
  update public.departments set parent_department_id = v_dispute_grp where division_id = v_credit and key in ('dispute','complaints','bureau_calling') and archived_at is null;
  update public.departments set parent_department_id = v_cs_grp      where division_id = v_credit and key in ('onboarding','support') and archived_at is null;

  -- TalentOps
  update public.departments set functions = array['Appointment Setters','Sales Agents','Sales Operations','Lead Management'], sort = 1 where division_id = v_talent and key = 'sales';
  update public.departments set functions = array['Social Media & Content','Graphic Design','Branding','Campaign Management','Community (Skool)'], sort = 2 where division_id = v_talent and key = 'marketing';
  update public.departments set functions = array['General Inquiries','Client Assistance','Technical Support','Escalations'], sort = 3 where division_id = v_talent and key = 'dedicated_support';
  update public.departments set functions = array['Recruitment','Applicant Screening','Onboarding Coordination','Training & Development','HR Operations Support'], sort = 4 where division_id = v_talent and key = 'recruitment';
  update public.departments set show_on_chart = false where division_id = v_talent and key = 'staff_management';

  -- FundingOps: the two chart departments; the pipeline stages are engine rows
  update public.departments set functions = array['Funding Processors','Application Review','Document Preparation','Lender Coordination','Status Tracking'], sort = 1 where division_id = v_funding and key = 'funding_processing';
  update public.departments set functions = array['Client Support','File Follow Up','Lender Communication','Issue Resolution','Administrative Support'], sort = 2 where division_id = v_funding and key = 'funding_support';
  update public.departments set show_on_chart = false where division_id = v_funding and key in ('document_review','funded_deals','lender_matching','offers','readiness_review','stipulations','submissions');

  -- BES CRM
  update public.departments set functions = array['GHL Automations','Workflow Development','Integrations (Zapier/Make)','System Optimization','Technical Support'], sort = 1 where division_id = v_crm and key = 'ghl_crm_ops';
  update public.departments set functions = array['Website Design','Funnel Buildouts','Landing Pages','UI/UX Design','Conversion Optimization','Maintenance & Updates'], sort = 2 where division_id = v_crm and key = 'websites_funnels';

  -- Corporate seats with their reporting line
  select id into v_ceo from public.positions where agency_id = v_agency and division_id = v_corp and title = 'Chief Executive Officer' and archived_at is null;
  select id into v_coo from public.positions where agency_id = v_agency and division_id = v_corp and title = 'Chief Operating Officer' and archived_at is null;
  update public.positions set description = 'Vision | Strategy | Growth | Overall Leadership' where id = v_ceo;
  update public.positions set description = 'Operations | Execution | People | Revenue' where id = v_coo;
  insert into public.positions (agency_id, title, division_id, reports_to_position_id, description, headcount, sort, created_by)
  select v_agency, x.title, v_corp, v_coo, x.descr, 1, x.sort, v_dee
    from (values ('Sales & Marketing Executive', 'Revenue Growth | Lead Generation | Marketing Strategy | Brand', 1),
                 ('Executive Assistant',         'Partners | Invoicing | Collections | Executive Support', 2),
                 ('Managing Partner',            'HR | Talent Sourcing | Payroll | People & Teams', 3)) as x(title, descr, sort)
   where not exists (select 1 from public.positions p where p.agency_id = v_agency and p.title = x.title and p.archived_at is null);
  insert into public.position_assignments (agency_id, position_id, user_id, assignment_type, effective_from, note, created_by)
  select v_agency, p.id, pr.id, 'permanent', coalesce(m.hired_on, current_date), 'Dee''s org chart, 2026-09-20', v_dee
    from public.positions p, public.profiles pr join public.agency_memberships m on m.user_id = pr.id
   where p.agency_id = v_agency and p.archived_at is null
     and ((p.title = 'Executive Assistant' and pr.email = 'navalesjorelynmae.bes@gmail.com')
       or (p.title = 'Managing Partner'    and pr.email = 'lordvrye.bes@gmail.com'))
     and not exists (select 1 from public.position_assignments a where a.position_id = p.id and a.user_id = pr.id and a.ended_at is null);
end $$;
