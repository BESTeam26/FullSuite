-- =============================================================================
-- Agents CHECK the standard work. They do not retype it.
--
-- Dee, 2026-09-12: "Agents should NOT manually type routine steps every time.
-- The system already knows Department + Work Status. Therefore it should
-- automatically load that department/status's standard completion checklist…
-- Agents should not be designing the SOP while processing the client."
--
-- I shipped a checklist that started empty with "Add the ones this file
-- needs". That is a blank page handed to somebody mid-production.
--
-- ── THE VOCABULARY ALREADY EXISTED ──────────────────────────────────────────
--
-- `WORK_ITEMS` in `creditops-access.tsx` has been the CreditOps action library
-- all along — fifty named outputs, by department, and exactly what Complete
-- Work records as production. It was hard-coded in React, which is what Dee
-- ruled out, and it was only reachable through the completion form.
--
-- These are the same labels, as rows. So a checked step and a logged
-- production action are the same words, and management can change the standard
-- without a deployment.
--
-- ── DEPARTMENT, AND OPTIONALLY WORK STATUS ─────────────────────────────────
--
-- `work_status` null means "every status in this department" — the sensible
-- default, and where every seeded row sits today. A status-specific list is a
-- row with the status filled in, and it REPLACES the department default
-- rather than adding to it, so a specific answer is never diluted by a
-- general one.
-- =============================================================================

create table if not exists public.creditops_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  department public.fulfillment_department not null,
  /** Null: applies to every status in this department. */
  work_status text,
  label text not null check (btrim(label) <> ''),
  /** True: part of "the standard work is done" for Quick Complete. */
  required boolean not null default true,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agency_id, department, work_status, label)
);

comment on table public.creditops_checklist_templates is
  'The standard actions for a department''s work, as rows. Same labels the completion form records as production, so a checked step and a logged action are the same words (Dee, 2026-09-12).';

alter table public.creditops_checklist_templates enable row level security;

drop policy if exists creditops_checklist_templates_select on public.creditops_checklist_templates;
create policy creditops_checklist_templates_select on public.creditops_checklist_templates
  for select to authenticated using (public.is_staff_of(agency_id));

drop policy if exists creditops_checklist_templates_write on public.creditops_checklist_templates;
create policy creditops_checklist_templates_write on public.creditops_checklist_templates
  for all to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('ops.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('ops.manage'));

-- ── The standard work, from the library that already existed ────────────────
insert into public.creditops_checklist_templates (agency_id, department, work_status, label, required, sort)
select a.id, v.dept::public.fulfillment_department, null, v.label, v.required, v.sort
  from public.agencies a, (values
    -- Onboarding
    ('Onboarding','Client File Reviewed',true,10),
    ('Onboarding','Documents Reviewed',true,20),
    ('Onboarding','Credit Monitoring Access Verified',true,30),
    ('Onboarding','Credit Report Imported',true,40),
    ('Onboarding','Missing Requirements Followed Up',false,50),
    ('Onboarding','Client Ready for Round 1',true,60),
    -- Dispute Processing
    ('Dispute','Reimport / Credit Report Reviewed',true,10),
    ('Dispute','CRA Letters Prepared',true,20),
    ('Dispute','Direct Furnisher Prep',false,30),
    ('Dispute','Inquiry Dispute Prepared',false,40),
    ('Dispute','Secondary Bureau Dispute',false,50),
    ('Dispute','Security Freeze',false,60),
    ('Dispute','Round Processing Completed',true,70),
    -- Client Success / Support
    ('Support','Credit report reimported',true,10),
    ('Support','Results reviewed',true,20),
    ('Support','Progress Update Completed',true,30),
    ('Support','Client Update Completed',true,40),
    ('Support','Document Follow-Up Completed',false,50),
    ('Support','Credit Monitoring Issue Handled',false,60),
    ('Support','Next round or status determined',true,70),
    -- Complaints & Mailing
    ('Complaints','Complaint Prepared',true,10),
    ('Complaints','Supporting documents saved',true,20),
    ('Complaints','CFPB Complaint',false,30),
    ('Complaints','FTC Filing',false,40),
    ('Complaints','Letters Prepared for Mailing',false,50),
    ('Complaints','Mailing Completed',false,60),
    ('Complaints','Tracking / Mailing Proof Updated',false,70),
    -- Bureau Calling
    ('Bureau Calling','Experian Call Completed',false,10),
    ('Bureau Calling','Equifax Call Completed',false,20),
    ('Bureau Calling','TransUnion Call Completed',false,30),
    ('Bureau Calling','Creditor / Furnisher Call Completed',false,40),
    ('Bureau Calling','Verification Call Completed',false,50),
    ('Bureau Calling','Follow-Up Call Completed',false,60)
  ) as v(dept, label, required, sort)
on conflict (agency_id, department, work_status, label) do nothing;

-- ── Instantiating it for one client's work ──────────────────────────────────
/**
 * Put the standard steps on this client's department work, once.
 *
 * Called when a department row opens and whenever the Work tab is read, so a
 * file that predates the templates gets them the first time somebody looks.
 * Idempotent: a step already on the file — checked or not — is left exactly as
 * it is, so instantiating twice can never un-tick anybody's work.
 *
 * A status-specific list REPLACES the department default. A specific answer
 * that also got the general one would be a longer list, not a better one.
 */
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
         /* A status-specific list when one exists, otherwise the default. */
         select case when exists (
           select 1 from public.creditops_checklist_templates s
            where s.agency_id = c.agency_id and s.department = p_department
              and s.active and upper(s.work_status) = upper(v_status)
         ) then v_status else null end)
  ), inserted as (
    insert into public.client_work_checklist (client_id, department, label, sort)
    select p_client, p_department, ch.label, ch.sort from chosen ch
     where not exists (
       select 1 from public.client_work_checklist w
        where w.client_id = p_client and w.department = p_department and w.label = ch.label)
    returning 1
  )
  select count(*)::int into v_added from inserted;
  return v_added;
end $function$;

revoke execute on function public.creditops_apply_checklist_template(uuid, public.fulfillment_department) from public, anon;
grant execute on function public.creditops_apply_checklist_template(uuid, public.fulfillment_department) to authenticated;
