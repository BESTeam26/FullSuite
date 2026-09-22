-- "OB" becomes Onboarding, and there is no "not started".
--
-- Dee, 2026-09-22: *"I don't want OB, I need full term Onboarding Not Started
-- — and we don't have that actually, it's incomplete onboarding only."*
--
-- Two things at once. The abbreviations are spelled out, and the state they
-- were abbreviating in one case does not exist: BES has no "not started", only
-- "incomplete onboarding". A file arrives with something missing; that is the
-- same thing.
--
--   OB NOT STARTED   → gone. INCOMPLETE ONBOARDING covers it.
--   OB INCOMPLETE    → INCOMPLETE ONBOARDING
--   OB IN REVIEW     → ONBOARDING IN REVIEW
--   OB READY FOR R1  → ONBOARDING READY FOR ROUND 1
--
-- DOCS PENDING, ACCESS VERIFIED and PARTNER ENDORSED already read as English
-- and are untouched.
--
-- ── INCOMPLETE ONBOARDING IS NOW THE ENTRY STATE ──────────────────────────
--
-- It is listed first, and `handoffEntryStatus` opens a department on its first
-- OPEN status — so a file handed to Onboarding now starts as incomplete rather
-- than as "not started", which is exactly Dee's point: that is the state it is
-- actually in.
--
-- ── DEPARTMENT STATUSES ARE TEXT, SO THE ROWS MOVE WITH THE WORDS ─────────
--
-- Unlike the client status this is not an enum, so there is no rename to
-- inherit: seven live department rows and four routing entry statuses are
-- rewritten here. `ONBOARDING READY FOR ROUND 1` also has to enter the closed
-- set in the same breath, or three finished files would look open the moment
-- the words changed.

create or replace function public.creditops_department_statuses(p_department public.fulfillment_department)
returns text[] language sql immutable as $function$
  select case p_department
    /* INCOMPLETE ONBOARDING first: it is the state a file arrives in, and the
       first open status is what a handoff opens on. */
    when 'Onboarding'     then array['INCOMPLETE ONBOARDING','ONBOARDING IN REVIEW','DOCS PENDING','ACCESS VERIFIED','ONBOARDING READY FOR ROUND 1','PARTNER ENDORSED']
    when 'Dispute'        then array['NEW ONBOARDING','INCOMPLETE ONBOARDING','READY FOR ROUND 1','READY FOR PROCESSING','ROUND SENT - AWAITING RESULTS','READY FOR REIMPORT / REVIEW','WAITING FOR PARTNER APPROVAL','COMPLETED','ARCHIVED / INACTIVE']
    when 'Support'        then array['SUPPORT NEW','ONBOARDING FOLLOWUP','READY FOR REIMPORT','MONITORING ISSUE','BILLING ISSUE','WAITING CLIENT RESPONSE','ESCALATED TO MANAGEMENT','SUPPORT RESOLVED']
    when 'Complaints'     then array['FOR COMPLAINTS','CFPB NEEDED','FTC NEEDED','CM NOT NEEDED','LETTERS PENDING','LETTERS MAILED','CFPB FILED','FTC FILED','BBB FILED','AG FILED','CM AWAITING RESPONSE','CM COMPLETED']
    when 'Bureau Calling' then array['BC NOT NEEDED','BC NEEDED','BC IN PROGRESS','BC COMPLETED']
  end
$function$;

/* The closed set gains the new spelling and keeps the old one, because a
   report reading last month's rows must still see them as finished. */
create or replace function public.creditops_status_is_actionable(p_department public.fulfillment_department, p_status text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select upper(trim(p_status)) not in (
    -- closed: nothing open for this department
    'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
    'SUPPORT RESOLVED', 'ONBOARDING READY FOR ROUND 1', 'OB READY FOR R1',
    'PARTNER ENDORSED', 'COMPLETED', 'ARCHIVED / INACTIVE',
    -- open, but the clock belongs to somebody else
    'ROUND SENT - AWAITING RESULTS', 'WAITING FOR PARTNER APPROVAL',
    'WAITING CLIENT RESPONSE', 'WAITING ON CLIENT', 'CM AWAITING RESPONSE',
    'DOCS PENDING'
  )
$function$;

create or replace function public.creditops_closed_status_for(p_department public.fulfillment_department)
returns text language sql immutable as $function$
  select case p_department
    when 'Onboarding'     then 'ONBOARDING READY FOR ROUND 1'
    when 'Dispute'        then 'COMPLETED'
    when 'Support'        then 'SUPPORT RESOLVED'
    when 'Complaints'     then 'CM COMPLETED'
    when 'Bureau Calling' then 'BC COMPLETED'
  end
$function$;

-- ── The rows, the routing and the policies ────────────────────────────────
do $$
declare v_n int; v_total int := 0;
begin
  /* `NOT STARTED` folds into `INCOMPLETE ONBOARDING` rather than being lost. */
  update public.client_department_statuses
     set status = case upper(btrim(status))
                    when 'OB NOT STARTED'  then 'INCOMPLETE ONBOARDING'
                    when 'OB INCOMPLETE'   then 'INCOMPLETE ONBOARDING'
                    when 'OB IN REVIEW'    then 'ONBOARDING IN REVIEW'
                    when 'OB READY FOR R1' then 'ONBOARDING READY FOR ROUND 1'
                  end,
         updated_at = now()
   where department = 'Onboarding'
     and upper(btrim(status)) in ('OB NOT STARTED','OB INCOMPLETE','OB IN REVIEW','OB READY FOR R1');
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  raise notice 'department rows rewritten: %', v_n;

  update public.creditops_status_routing
     set entry_status = case upper(btrim(entry_status))
                          when 'OB NOT STARTED'  then 'INCOMPLETE ONBOARDING'
                          when 'OB INCOMPLETE'   then 'INCOMPLETE ONBOARDING'
                          when 'OB IN REVIEW'    then 'ONBOARDING IN REVIEW'
                          when 'OB READY FOR R1' then 'ONBOARDING READY FOR ROUND 1'
                        end
   where upper(btrim(entry_status)) in ('OB NOT STARTED','OB INCOMPLETE','OB IN REVIEW','OB READY FOR R1');
  get diagnostics v_n = row_count;
  raise notice 'routing entry statuses rewritten: %', v_n;

  /* Three Onboarding policies say the same thing in three spellings. Keep one
     and point it at the new word; the follow-up cycle rules ride on it. */
  delete from public.sla_policies
   where department = 'Onboarding' and status in ('OB INCOMPLETE', 'Incomplete Onboarding');
  update public.sla_policies
     set status = 'INCOMPLETE ONBOARDING'
   where department = 'Onboarding' and status = 'INCOMPLETE ONBOARDING';

  if exists (
    select 1 from public.client_department_statuses ds
     where not (upper(trim(ds.status)) = any (public.creditops_department_statuses(ds.department)))
  ) then
    raise exception 'A department status is outside its vocabulary after the rename — refusing to finish quietly';
  end if;
end $$;
