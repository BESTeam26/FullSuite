-- The credit status list becomes the workflow, in Dee's words.
--
-- Dee, 2026-09-22, giving the whole list rather than corrections to it:
--
--   New Client · Incomplete Onboarding · Ready for Round 1 · Ready for
--   Processing · Round 1–12 Sent (waiting) · Ready for Credit Review ·
--   Monitoring Issue 1/2/3 · Non Workable (endorse to partner, after three
--   attempts) · For Partner Confirmation · Outsourcing - Unpaid ·
--   Program Completed · Graduated · Inactive / Canceled
--
-- ── ALMOST ALL OF IT IS A RENAME ──────────────────────────────────────────
--
-- The states existed under older names. Renaming the enum value rather than
-- adding a new one keeps every routing row, every SLA policy and every
-- client's history pointing at the same thing — a client who was `CMS Issue 2`
-- yesterday is `Monitoring Issue 2` today, which is what she meant, not a
-- different state they have to be migrated onto.
--
--   CMS Issue 1/2/3               → Monitoring Issue 1/2/3
--   Results Available for Review  → Ready for Credit Review
--   On Hold (Non Workable)        → Non Workable
--   Completed                     → Program Completed
--   Archived                      → Inactive / Canceled
--
-- Only `Outsourcing - Unpaid` is genuinely new. Postgres will not let a value
-- added in this transaction be USED in it, so its routing row is the next
-- migration.
--
-- ── AND ONE THING THAT NEVER WORKED ───────────────────────────────────────
--
-- Dee, asked what `Non Workable` should mean: *"Leaves every BES queue."*
--
-- A terminal status with no department named — `Completed`, `Graduated`,
-- `Archived` — means the whole file is finished. The routing engine did
-- nothing for those beyond refreshing the headline, so a graduated client
-- could sit in the Dispute queue for ever. Now they close every open
-- department and release whoever held it. Terminal statuses that DO name a
-- department (BC COMPLETED, CM COMPLETED, SUPPORT RESOLVED) are untouched:
-- they finish one department, not the file.

alter type public.fulfillment_client_status rename value 'CMS Issue 1' to 'Monitoring Issue 1';
alter type public.fulfillment_client_status rename value 'CMS Issue 2' to 'Monitoring Issue 2';
alter type public.fulfillment_client_status rename value 'CMS Issue 3' to 'Monitoring Issue 3';
alter type public.fulfillment_client_status rename value 'Results Available for Review' to 'Ready for Credit Review';
alter type public.fulfillment_client_status rename value 'On Hold (Non Workable)' to 'Non Workable';
alter type public.fulfillment_client_status rename value 'Completed' to 'Program Completed';
alter type public.fulfillment_client_status rename value 'Archived' to 'Inactive / Canceled';

alter type public.fulfillment_client_status add value if not exists 'Outsourcing - Unpaid';

/**
 * The status that means "this department has nothing open", per department.
 *
 * Each department has its own vocabulary, so there is no single word for
 * done. `creditops_route_client` used to write 'COMPLETED' into every
 * department when closing one — a Dispute word, silently outside Support's
 * and Complaints' own lists. This gives each the closer it actually has.
 */
create or replace function public.creditops_closed_status_for(p_department public.fulfillment_department)
returns text language sql immutable as $function$
  select case p_department
    when 'Onboarding'     then 'OB READY FOR R1'
    when 'Dispute'        then 'COMPLETED'
    when 'Support'        then 'SUPPORT RESOLVED'
    when 'Complaints'     then 'CM COMPLETED'
    when 'Bureau Calling' then 'BC COMPLETED'
  end
$function$;

/* Terminal with no department closes the whole file. Patched in place so the
   rest of the routing engine is provably unchanged. */
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creditops_route_client';

  if position('creditops_closed_status_for' in v_src) > 0 then
    raise notice 'routing already closes terminal files; leaving it alone';
    return;
  end if;

  v_src := replace(v_src,
    $old$  if r.kind = 'terminal' then
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;$old$,
    $new$  if r.kind = 'terminal' then
    /* No department named = the whole file is finished, so nothing may be
       left open on it and nobody may still be holding it (Dee, 2026-09-22:
       "Leaves every BES queue"). A terminal that names one department only
       finishes that department, and is left alone here. */
    if r.department is null then
      update public.client_department_statuses s
         set status = public.creditops_closed_status_for(s.department),
             assignee_id = null, assignment_method = 'handoff',
             assigned_at = now(), updated_at = now()
       where s.client_id = p_client
         and upper(btrim(s.status)) not in (
           'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
           'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
           'COMPLETED', 'ARCHIVED / INACTIVE');
    end if;
    perform public.creditops_refresh_headline(p_client);
    return;
  end if;$new$);

  if position('creditops_closed_status_for' in v_src) = 0 then
    raise exception 'creditops_route_client no longer contains the terminal branch as written — refusing to rewrite it blind';
  end if;
  execute v_src;
end $$;

/* Non Workable is endorsed back to the partner, so it is terminal for the
   file rather than work sitting in Support. */
update public.creditops_status_routing
   set kind = 'terminal', department = null, entry_status = null,
       note = 'Endorsed back to the partner after three attempts. No BES department holds it.'
 where status = 'Non Workable';
