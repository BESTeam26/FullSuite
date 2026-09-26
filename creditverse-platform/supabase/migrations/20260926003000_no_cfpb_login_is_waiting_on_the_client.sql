-- "No CFPB login" is waiting on the client, not new onboarding work.
--
-- Three BMF clients — Jade Booker, David Morgan, Robert Livesay — carried the
-- ClickUp status "no cfpb login", which the importer had no mapping for, so
-- they fell to "New Client" and queued as brand-new onboarding work.
--
-- The third time this pattern has appeared today, and the report is what
-- caught it each time: the import names an unmapped status rather than
-- swallowing it.
--
-- BES cannot file a complaint without the client's CFPB portal login, so the
-- file is waiting on the CLIENT. "For Client Confirmation" is precisely that
-- state in Dee's queue doctrine — it routes to Support · WAITING ON CLIENT,
-- which is waiting externally and NOT actionable, and it is the state her
-- client portal is built to resolve by asking for what is needed.
--
-- As with the endorsed files: changing the client status does not close the
-- Onboarding row routing already opened, so that is done too — with DOCS
-- PENDING, which is what an onboarding file missing a document actually is,
-- and which is not actionable.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_moved int; v_closed int;
begin
  update public.fulfillment_clients
     set status = 'For Client Confirmation', updated_at = now()
   where source_status = 'no cfpb login' and status = 'New Client';
  get diagnostics v_moved = row_count;

  update public.client_department_statuses s
     set status = 'DOCS PENDING', updated_at = now()
    from public.fulfillment_clients fc
   where fc.id = s.client_id
     and fc.source_status = 'no cfpb login'
     and s.department = 'Onboarding'
     and s.status = 'INCOMPLETE ONBOARDING';
  get diagnostics v_closed = row_count;

  raise notice '% moved off New Client, % onboarding rows closed', v_moved, v_closed;
end $$;

/* Nothing imported is still sitting on New Client, and nothing finished or
   waiting is actionable in Onboarding. */
do $$
declare v_unmapped int; v_queued int;
begin
  select count(*) into v_unmapped from public.fulfillment_clients
   where status = 'New Client' and source_status is not null;
  if v_unmapped > 0 then
    raise exception '% imported clients are still on New Client', v_unmapped;
  end if;

  select count(*) into v_queued
    from public.creditops_department_queue q
    join public.fulfillment_clients fc on fc.id = q.client_id
   where fc.source_status in ('no cfpb login', 'endorsed to client', 'cfpb (autoclosed)')
     and q.department = 'Onboarding' and q.actionable;
  if v_queued > 0 then
    raise exception '% waiting or finished files are still actionable in Onboarding', v_queued;
  end if;
end $$;

commit;
