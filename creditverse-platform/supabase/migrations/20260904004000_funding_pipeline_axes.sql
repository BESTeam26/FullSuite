-- =============================================================================
-- FundingOS pipeline: three separate state axes on a funding file
-- (ARCHITECTURE_PROPOSAL_FUNDING_DOMAIN.md, Addendum C2; Dee's design).
--
--   stage             where the file is on the 17-step spine (five phases)
--   secondary_status  disposition off the main flow (13 values)
--   waiting_on        who owns the next action (7 values)
--
-- These are never conflated: "No Current Program Fit" is not "Lender Declined";
-- "Not Funding Ready" is not "Lender Declined"; Funded is a stage AND a
-- disposition and is only ever set by confirm_funding() (0061), never by a
-- stage move. The old nine-value stage mixed stage with disposition; it is
-- mapped, not guessed, and the old type is retired.
--
-- Postgres cannot use a value added to an enum inside the same transaction, so
-- the spine is a new type: add the new column, backfill, drop the old, rename.
-- =============================================================================

create type public.funding_pipeline_stage as enum (
  'New Application', 'Application Review',
  'Document Collection', 'File Review', 'Needs Client Action', 'Ready for Funding Review',
  'Lender Selection', 'Ready for Submission', 'Submitted',
  'Lender Review', 'Additional Requirements', 'Conditional Approval', 'Offer Received', 'Offer Accepted',
  'Final Approval', 'Funding', 'Funded'
);
create type public.funding_secondary_status as enum (
  'Active Funding', 'Funded', 'Not Funding Ready', 'No Current Program Fit', 'Endorsed to Readiness',
  'Client Declined Offer', 'Lender Declined', 'Withdrawn', 'Unable to Contact', 'Duplicate',
  'Verification Concern', 'Closed', 'Renewal Candidate'
);
create type public.funding_waiting_on as enum (
  'Client', 'Internal Team', 'Lender', 'Third Party', 'Documents', 'Approval', 'No Action Required'
);

alter table public.funding_files
  add column pipeline_stage   public.funding_pipeline_stage not null default 'New Application',
  add column secondary_status public.funding_secondary_status not null default 'Active Funding',
  add column waiting_on       public.funding_waiting_on not null default 'Internal Team';

update public.funding_files set
  pipeline_stage = case stage
    when 'Readiness Review' then 'Application Review'
    when 'Document Review'  then 'Document Collection'
    when 'Lender Matching'  then 'Lender Selection'
    when 'Submitted'        then 'Submitted'
    when 'Stipulations'     then 'Additional Requirements'
    when 'Offer Received'   then 'Offer Received'
    when 'Funded'           then 'Funded'
    when 'Declined'         then 'Lender Review'
    when 'Withdrawn'        then 'Lender Review'
  end::public.funding_pipeline_stage,
  secondary_status = case stage
    when 'Funded'    then 'Funded'
    when 'Declined'  then 'Lender Declined'
    when 'Withdrawn' then 'Withdrawn'
    else 'Active Funding'
  end::public.funding_secondary_status,
  waiting_on = case stage
    when 'Document Review' then 'Documents'
    when 'Submitted'       then 'Lender'
    when 'Stipulations'    then 'Client'
    when 'Offer Received'  then 'Client'
    when 'Funded'          then 'No Action Required'
    when 'Declined'        then 'No Action Required'
    when 'Withdrawn'       then 'No Action Required'
    else 'Internal Team'
  end::public.funding_waiting_on;

alter table public.funding_files drop column stage;
alter table public.funding_files rename column pipeline_stage to stage;
drop type public.funding_file_stage;
create index funding_files_client_idx on public.funding_files (client_id, stage);   -- dropped with the old column; recreated on the new one
create index funding_files_stage_idx on public.funding_files (stage) where secondary_status = 'Active Funding';
create index funding_files_waiting_idx on public.funding_files (waiting_on) where secondary_status = 'Active Funding';

-- ---------------------------------------------------------------------------
-- Moving a file is an explicit human action with an audit row per axis changed.
-- ---------------------------------------------------------------------------
create or replace function public.move_funding_file(
  p_file uuid,
  p_stage public.funding_pipeline_stage default null,
  p_secondary public.funding_secondary_status default null,
  p_waiting_on public.funding_waiting_on default null,
  p_note text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  f public.funding_files%rowtype;
  t record;
  v_vis public.activity_visibility;
begin
  select * into f from public.funding_files where id = p_file;
  if f.id is null then raise exception 'Funding file not visible' using errcode = '42501'; end if;
  if not public.file_reviewer(p_file) then raise exception 'Not permitted to move this file' using errcode = '42501'; end if;
  if p_stage = 'Funded' or p_secondary = 'Funded' then
    raise exception 'Funded is set only by confirming funding with disbursement data' using errcode = '22023';
  end if;
  if p_stage is null and p_secondary is null and p_waiting_on is null then return; end if;

  select * into t from public.funding_file_tenancy(p_file);
  v_vis := case when public.is_staff_of(t.agency_id) and t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                when public.is_staff_of(t.agency_id) then 'bes_internal'
                when t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                else 'organization_internal' end::public.activity_visibility;

  update public.funding_files
     set stage = coalesce(p_stage, stage),
         secondary_status = coalesce(p_secondary, secondary_status),
         waiting_on = coalesce(p_waiting_on, waiting_on),
         last_activity_at = now()
   where id = p_file;
  update public.funding_clients set last_activity_at = now() where id = f.client_id;

  if p_stage is not null and p_stage <> f.stage then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Stage changed',
            coalesce(p_note, f.purpose || ' · ' || f.stage::text || ' → ' || p_stage::text), 'stage:' || p_file::text, f.stage::text, p_stage::text, v_vis);
  end if;
  if p_secondary is not null and p_secondary <> f.secondary_status then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Status changed',
            coalesce(p_note, f.purpose || ' · ' || f.secondary_status::text || ' → ' || p_secondary::text), 'secondary_status:' || p_file::text, f.secondary_status::text, p_secondary::text, v_vis);
  end if;
  if p_waiting_on is not null and p_waiting_on <> f.waiting_on then
    insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
    values (t.agency_id, t.organization_id, 'funding_client', f.client_id::text, auth.uid(), 'Waiting on changed',
            coalesce(p_note, f.purpose || ' · waiting on ' || p_waiting_on::text), 'waiting_on:' || p_file::text, f.waiting_on::text, p_waiting_on::text, v_vis);
  end if;
end $$;
revoke execute on function public.move_funding_file(uuid, public.funding_pipeline_stage, public.funding_secondary_status, public.funding_waiting_on, text) from public, anon;
grant execute on function public.move_funding_file(uuid, public.funding_pipeline_stage, public.funding_secondary_status, public.funding_waiting_on, text) to authenticated;
