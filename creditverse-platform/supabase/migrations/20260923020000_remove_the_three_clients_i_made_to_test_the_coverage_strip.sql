-- The three throwaway clients used to prove the coverage strip, removed.
--
-- I inserted "ZZ COVERAGE CHECK 1/2/3" on 2026-09-23 and forced one into each
-- state — unassigned, overdue, on track — because the strip cannot be trusted
-- on an empty list: every card reading zero looks identical whether the query
-- is right or silently returning nothing. They did their job (and exposed a
-- false "no active staff" label on Complaints), and CreditOps is about to
-- receive Dee's real ClickUp list, so they must not be in it.
--
-- Named ZZ so they sorted to the bottom and could never be mistaken for a real
-- file while they existed. Deleted by their exact ids, checked against those
-- names, so this cannot widen to anything else.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_ids uuid[] := array[
    '87fb8068-45be-4133-bb9b-2f908d4abf0e',
    'e6fc869f-5cdf-4ca5-bb95-27440fa26c36',
    '0f04a0b7-f16f-4117-a1ec-c8b66c0a0307'
  ]::uuid[];
  v_wrong int;
  v_production int;
  v_deleted int;
begin
  /* An id is not evidence on its own. If any of these three is not the row I
     created — reused id, restored backup, Dee typed a real client at that key
     — stop rather than delete a stranger. */
  select count(*) into v_wrong
    from public.fulfillment_clients
   where id = any(v_ids)
     and (name not like 'ZZ COVERAGE CHECK%' or is_fixture);
  if v_wrong > 0 then
    raise exception '% of those ids is not a ZZ COVERAGE CHECK client — not deleting', v_wrong;
  end if;

  /* Nobody was meant to work these. If somebody logged production against one
     it is a real record (ON DELETE RESTRICT would refuse anyway) and a human
     should look before anything is removed. */
  select count(*) into v_production
    from public.production_logs where client_id = any(v_ids) and not is_voided;
  if v_production > 0 then
    raise exception '% production rows are attached — export and confirm first', v_production;
  end if;

  delete from public.activity_events
   where entity_type = 'fulfillment_client' and entity_id = any(
     select id::text from unnest(v_ids) as id);

  /* Department rows, checklists and SLA overrides cascade from the client. */
  delete from public.fulfillment_clients where id = any(v_ids);
  get diagnostics v_deleted = row_count;
  raise notice 'removed % coverage-test clients', v_deleted;
end $$;

commit;
