-- Eight finished files were sitting in the Onboarding queue as new work.
--
-- EDP Management Group imported 82 clients, and eight of them carried a
-- ClickUp status the importer had no mapping for:
--
--   endorsed to client   7
--   cfpb (autoclosed)    1
--
-- An unmapped status falls to "New Client", which routes to Onboarding ·
-- INCOMPLETE ONBOARDING. So eight files that are FINISHED were queued as
-- brand-new onboarding work, and counted on the badge Dee reads to decide
-- where her team starts.
--
-- The import did say so — it reports an unmapped status by name, and that
-- report is what found these. It reported them and carried on, which is the
-- right behaviour for one card and the wrong outcome for eight.
--
-- ── THE MAPPINGS ──────────────────────────────────────────────────────────
--
-- ClickUp groups "endorsed to client" with its DONE statuses: the file has
-- been handed back to the partner. "Program Completed" is the canonical
-- end-state that opens no department, which is what a finished file needs.
--
-- "cfpb (autoclosed)" is a Complaints outcome — the complaint closed itself —
-- so it closes in Complaints rather than pretending the whole programme
-- ended.
--
-- Both are judgement calls on Dee's vocabulary, so both are named here rather
-- than buried: if "endorsed to client" should be Graduated, or the autoclosed
-- complaint should stay open, it is one line in each place.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_moved int; v_left int;
begin
  update public.fulfillment_clients
     set status = 'Program Completed', updated_at = now()
   where outsourcing_group_id = (select id from public.outsourcing_groups where name = 'EDP Management Group')
     and source_status = 'endorsed to client'
     and status = 'New Client';
  get diagnostics v_moved = row_count;
  raise notice 'endorsed to client: % moved off New Client', v_moved;

  update public.fulfillment_clients
     set status = 'COMPLAINT COMPLETED', updated_at = now()
   where outsourcing_group_id = (select id from public.outsourcing_groups where name = 'EDP Management Group')
     and source_status = 'cfpb (autoclosed)'
     and status = 'New Client';

  /* The status change alone does not clear the queue. Routing opened an
     Onboarding row the moment these landed as "New Client", and moving the
     client to a finished state leaves that row exactly where it was — which
     is the whole reason a file can read "Program Completed" and still sit in
     somebody's queue.
     
     PARTNER ENDORSED, because that is what "endorsed to client" MEANS in
     Onboarding's own vocabulary, and it is not actionable. */
  update public.client_department_statuses s
     set status = 'PARTNER ENDORSED', updated_at = now()
    from public.fulfillment_clients fc
   where fc.id = s.client_id
     and fc.source_status in ('endorsed to client', 'cfpb (autoclosed)')
     and s.department = 'Onboarding'
     and s.status = 'INCOMPLETE ONBOARDING';

  /* Only the ones the import genuinely could not place. A client somebody has
     since moved to New Client on purpose is not this migration's business —
     which is why both updates require the source status AND the landing
     status. */
  select count(*) into v_left from public.fulfillment_clients
   where status = 'New Client' and source_status is not null;
  if v_left > 0 then
    raise exception '% imported clients are still on New Client', v_left;
  end if;
end $$;

/* And nothing finished is queued as onboarding work. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.creditops_department_queue q
    join public.fulfillment_clients fc on fc.id = q.client_id
   where fc.source_status in ('endorsed to client', 'cfpb (autoclosed)')
     and q.department = 'Onboarding' and q.actionable;
  if v_bad > 0 then
    raise exception '% finished files are still actionable in Onboarding', v_bad;
  end if;
end $$;

commit;
