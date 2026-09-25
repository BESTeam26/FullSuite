-- The leftovers go, and the fixtures stop counting.
--
-- Dee, 2026-09-25: "Delete all test record and records prior to my latest
-- upload like Approved with Tiff and Kevin."
--
-- ── WHAT IS DELETED ───────────────────────────────────────────────────────
--
-- Five people on REAL partners who predate the ClickUp imports and carry
-- nothing: no CreditOps work file, no FundingOps file, no vault entry, no
-- portal login.
--
--   Jane Smith             Kevin Hernandez       2026-09-07
--   Daniuel Williams       Wavy One Solutions    2026-09-08
--   Thania Ramirez Calix   Kevin Hernandez       2026-09-11
--
-- Thania is the reason this deletes by ID. Kevin has TWO of her: that stale
-- row, and the one imported today with a work file and a vault entry. The
-- first attempt matched on names, and the guard refused the whole migration
-- rather than take the real one with the stale one.
--   Selena Alexander       K&A Consulting Group  2026-09-12
--   Kaori Test             Test Partner          2026-09-12
--
-- Selena Alexander is named here deliberately: her partner is TalentOps-only,
-- so having no CreditOps work is CORRECT for her rather than leftover. She is
-- removed because Dee asked for everything before the imports, and because
-- the record carries nothing — but if K&A ever needs her, she is a new row,
-- not a recovery.
--
-- ── WHAT IS NOT DELETED, AND WHY ──────────────────────────────────────────
--
-- The twelve [TEST] fixture people. They are not leftovers: they are what the
-- security matrix RUNS ON, and every one of its checks names them. Deleting
-- them would take the gate that proves nobody can see another partner's
-- clients — a far worse trade than a tidy list.
--
-- Dee's complaint is that she SEES them, and that is a separate fault with a
-- separate fix. The CreditOps client list already excludes fixtures. The
-- queue counts did not, so ten fixture rows were inflating her badges: that
-- is fixed here. The client DIRECTORY does not either, and `clients` has no
-- fixture flag to filter on — a real gap, and the next thing I do rather than
-- something I leave unsaid.
--
-- Cost impact: no material increase.

begin;

/* BY ID, not by name. The first attempt matched on the name and the guard
   refused it: Kevin Hernandez has TWO Thania Ramirez Calix rows — the 11
   September leftover, and the one imported from ClickUp today with a work
   file, comments and a vault entry. A name-based delete would have taken the
   real one with the stale one. */
do $$
declare v_attached int; v_deleted int;
declare v_ids constant uuid[] := array[
  '074c8dfe-7219-4fc3-856c-eb4cae62a4d9',   -- Daniuel Williams    Wavy One,  08 Sep
  'ae1bdef9-f63c-4a6f-8eea-4eb5688e7e7e',   -- Jane Smith          Kevin,     07 Sep
  '29ec19ee-4f2d-404a-9aef-4b9515c666b7',   -- Kaori Test          Test Ptnr, 12 Sep
  'a4667046-7274-4cb3-aadb-12dacaa99d12',   -- Selena Alexander    K&A,       12 Sep
  '0a88b6ad-09c0-4f5d-8013-b74e2f6b4733'    -- Thania Ramirez Calix Kevin,    11 Sep
]::uuid[];
begin
  /* Nothing may have attached itself since this was measured. A person who
     has acquired a work file, a funding file or a vault entry is somebody's
     record now, not a leftover. */
  select count(*) into v_attached
    from public.clients c
   where c.id = any(v_ids)
     and (exists (select 1 from public.fulfillment_clients fc where fc.client_id = c.id)
       or exists (select 1 from public.funding_clients f where f.client_id = c.id)
       or exists (select 1 from public.client_secrets s where s.client_id = c.id)
       or c.portal_user_id is not null);
  if v_attached > 0 then
    raise exception '% of them now carry real work — look before deleting', v_attached;
  end if;

  delete from public.clients c where c.id = any(v_ids);
  get diagnostics v_deleted = row_count;
  raise notice 'removed % leftover people', v_deleted;
end $$;

/* The queue badges count real work. Ten fixture rows were in Dee's numbers,
   which makes a badge a number she cannot reconcile against her own list —
   and the list already excludes them. */
create or replace function public.creditops_queue_counts()
returns table (department text, actionable int, waiting int)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select q.department::text,
         count(*) filter (where q.actionable)::int,
         count(*) filter (where q.waiting)::int
    from public.creditops_department_queue q
    join public.fulfillment_clients fc on fc.id = q.client_id
   where not coalesce(fc.is_fixture, false)
   group by q.department
$function$;

comment on function public.creditops_queue_counts() is
  'Actionable and waiting counts per CreditOps department, excluding the '
  'security fixtures — the client list excludes them too, and a badge that '
  'does not match the list it opens is worse than no badge (2026-09-25).';

commit;
