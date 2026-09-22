-- Seven status values no queue could route on.
--
-- Found while building the client card: `departmentWorkState()` reads a status
-- against the Status Guide, and nine rows held something that is not in it.
-- A status nothing recognises is treated as OPEN and ACTIONABLE by default, so
-- Bryan Rodriguez appeared in five live departments at once — one of them only
-- because Onboarding said `Complete`.
--
-- Dee, 2026-09-22, having been shown the exact values: *"The decision isn't
-- cosmetic because each mapping determines whether a row is actionable,
-- waiting, or finished."*
--
-- ── COMPLAINTS WAS MISSING A STEP ─────────────────────────────────────────
--
-- The guide had only FILED states. The team has been typing "For Complaints",
-- "CFPB Needed" and "FTC Needed" — the work between being handed the file and
-- having filed anything. Dee's decision was to ADD the step rather than
-- reinterpret the work as something it is not, so the CFPB/FTC distinction
-- survives. All three are actionable: nobody outside BES is holding them up,
-- which is what separates them from CM AWAITING RESPONSE.
--
-- FOR COMPLAINTS is listed first and is therefore what a handoff into
-- Complaints now opens on, replacing LETTERS PENDING. That is the correction:
-- a file just handed over has not had letters drafted.
--
-- ── ONBOARDING DID NOT GET A NEW WORD ─────────────────────────────────────
--
-- Dee: *"no other status aside from statuses I have provided."* Onboarding
-- already has two finished states, so `Complete` maps onto the existing
-- `OB READY FOR R1` rather than gaining a third. `Ready for Round 1` maps to
-- the same place — it is that status, differently spelled.
--
-- Casing was never the problem: every comparison already uppercases. These
-- were different words.

create or replace function public.creditops_department_statuses(p_department public.fulfillment_department)
returns text[] language sql immutable as $function$
  select case p_department
    when 'Onboarding'     then array['OB NOT STARTED','OB IN REVIEW','DOCS PENDING','MONITORING PENDING','ACCESS VERIFIED','OB READY FOR R1','PARTNER ENDORSED','OB INCOMPLETE']
    when 'Dispute'        then array['NEW ONBOARDING','INCOMPLETE ONBOARDING','READY FOR ROUND 1','READY FOR PROCESSING','ROUND SENT - AWAITING RESULTS','READY FOR REIMPORT / REVIEW','WAITING FOR PARTNER APPROVAL','COMPLETED','ARCHIVED / INACTIVE']
    when 'Support'        then array['SUPPORT NEW','ONBOARDING FOLLOWUP','READY FOR REIMPORT','MONITORING ISSUE','BILLING ISSUE','WAITING CLIENT RESPONSE','ESCALATED TO MANAGEMENT','SUPPORT RESOLVED']
    /* FOR COMPLAINTS first: it is the entry state a handoff opens on. */
    when 'Complaints'     then array['FOR COMPLAINTS','CFPB NEEDED','FTC NEEDED','CM NOT NEEDED','LETTERS PENDING','LETTERS MAILED','CFPB FILED','FTC FILED','BBB FILED','AG FILED','CM AWAITING RESPONSE','CM COMPLETED']
    when 'Bureau Calling' then array['BC NOT NEEDED','BC NEEDED','BC IN PROGRESS','BC COMPLETED']
  end
$function$;

-- ── The nine rows ─────────────────────────────────────────────────────────
/* Written through a plain UPDATE rather than `set_client_department_status`,
   because that writer now demands the caller work the department — and a
   migration has no caller. The status triggers still fire, so the SLA dates
   recompute and each change is written to `activity_events`, which is the
   point: the queue engine works out where these files actually belong.

   Keyed on the exact stored text. Anything that does not match is left alone
   and reported, rather than being caught by a LIKE that quietly takes more
   than it was meant to. */
do $$
declare
  v_map jsonb := jsonb_build_array(
    jsonb_build_object('dept','Onboarding','from','Complete',          'to','OB READY FOR R1'),
    jsonb_build_object('dept','Onboarding','from','Ready for Round 1', 'to','OB READY FOR R1'),
    jsonb_build_object('dept','Complaints','from','CFPB Needed',       'to','CFPB NEEDED'),
    jsonb_build_object('dept','Complaints','from','FTC Needed',        'to','FTC NEEDED'),
    jsonb_build_object('dept','Complaints','from','For Complaints',    'to','FOR COMPLAINTS'),
    jsonb_build_object('dept','Dispute',   'from','In Progress',       'to','READY FOR PROCESSING'),
    jsonb_build_object('dept','Support',   'from','Not Started',       'to','SUPPORT NEW')
  );
  r jsonb; v_n int; v_total int := 0;
begin
  for r in select * from jsonb_array_elements(v_map) loop
    update public.client_department_statuses
       set status = r->>'to', updated_at = now()
     where department = (r->>'dept')::public.fulfillment_department
       and status = r->>'from';
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    raise notice '% · % → % : % row(s)', r->>'dept', r->>'from', r->>'to', v_n;
  end loop;
  raise notice 'normalised % row(s) in total', v_total;

  /* Nothing may be left that the vocabulary does not know. */
  if exists (
    select 1 from public.client_department_statuses ds
     where not (upper(trim(ds.status)) = any (public.creditops_department_statuses(ds.department)))
  ) then
    raise exception 'A department status is still outside its vocabulary — refusing to finish quietly';
  end if;
end $$;
