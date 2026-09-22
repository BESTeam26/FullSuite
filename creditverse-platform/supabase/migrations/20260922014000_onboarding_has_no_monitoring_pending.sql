-- Onboarding does not wait on monitoring; it is either incomplete or it is not.
--
-- Dee, 2026-09-22: *"Monitoring Pending - we don't have this, we only have
-- incomplete onboarding."*
--
-- `MONITORING PENDING` was an Onboarding department status meaning "waiting
-- for the client to grant credit-monitoring access". BES does not track that
-- separately — a client who has not supplied access is simply
-- `OB INCOMPLETE`, which is already in the vocabulary and already means
-- somebody has to chase them.
--
-- Nothing held it: no department row, no SLA policy, no routing entry status.
-- It is removed rather than retired, because unlike a CLIENT status no record
-- can be sitting on it (checked, not assumed).
--
-- It also leaves the waiting set. That set is what separates "BES has work"
-- from "BES is waiting on somebody outside" (§23), and a status nothing can
-- hold should not be in either.

create or replace function public.creditops_department_statuses(p_department public.fulfillment_department)
returns text[] language sql immutable as $function$
  select case p_department
    when 'Onboarding'     then array['OB NOT STARTED','OB IN REVIEW','DOCS PENDING','ACCESS VERIFIED','OB READY FOR R1','PARTNER ENDORSED','OB INCOMPLETE']
    when 'Dispute'        then array['NEW ONBOARDING','INCOMPLETE ONBOARDING','READY FOR ROUND 1','READY FOR PROCESSING','ROUND SENT - AWAITING RESULTS','READY FOR REIMPORT / REVIEW','WAITING FOR PARTNER APPROVAL','COMPLETED','ARCHIVED / INACTIVE']
    when 'Support'        then array['SUPPORT NEW','ONBOARDING FOLLOWUP','READY FOR REIMPORT','MONITORING ISSUE','BILLING ISSUE','WAITING CLIENT RESPONSE','ESCALATED TO MANAGEMENT','SUPPORT RESOLVED']
    /* FOR COMPLAINTS first: it is the entry state a handoff opens on. */
    when 'Complaints'     then array['FOR COMPLAINTS','CFPB NEEDED','FTC NEEDED','CM NOT NEEDED','LETTERS PENDING','LETTERS MAILED','CFPB FILED','FTC FILED','BBB FILED','AG FILED','CM AWAITING RESPONSE','CM COMPLETED']
    when 'Bureau Calling' then array['BC NOT NEEDED','BC NEEDED','BC IN PROGRESS','BC COMPLETED']
  end
$function$;

create or replace function public.creditops_status_is_actionable(p_department public.fulfillment_department, p_status text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select upper(trim(p_status)) not in (
    -- closed: nothing open for this department
    'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
    'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
    'COMPLETED', 'ARCHIVED / INACTIVE',
    -- open, but the clock belongs to somebody else
    'ROUND SENT - AWAITING RESULTS', 'WAITING FOR PARTNER APPROVAL',
    'WAITING CLIENT RESPONSE', 'WAITING ON CLIENT', 'CM AWAITING RESPONSE',
    'DOCS PENDING'
  )
$function$;
