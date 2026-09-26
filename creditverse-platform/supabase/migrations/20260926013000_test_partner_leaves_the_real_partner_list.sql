-- "Test Partner" leaves the list; the production it carries is voided, not erased.
--
-- Dee, 2026-09-26: "delete all Test partners. We only have real partner and
-- real client data now." She chose, when shown what was attached: delete it,
-- and void the production as test data.
--
-- ── WHAT WAS ATTACHED ─────────────────────────────────────────────────────
--
-- Not an empty stub. One CRM project ("Project 1", 2026-09-15), 31 work items,
-- 5 channels, and 5 production records logged by James Ivan Lazo and Dee on
-- 15, 16 and 21 September while testing BES CRM.
--
-- ── WHY THIS ARCHIVES RATHER THAN DROPS THE ROW ───────────────────────────
--
-- `production_logs.work_item_id` is ON DELETE RESTRICT. The database refuses
-- to delete a work item that has production against it — and that refusal is
-- correct, it is the same rule that stops a real agent's recorded output being
-- erased by deleting the thing they worked on (rules 4 and 10). Nulling the
-- link to get past it would keep the row and destroy what it was FOR, which is
-- worse than keeping both.
--
-- So the outcome Dee asked for is delivered the way the data model allows:
--
--   · the 5 production records are VOIDED, with a reason. `is_voided` is
--     honoured in 21 places across EOD, production and performance, so they
--     stop counting toward James's output — which was the point — while the
--     history stays inspectable.
--   · the 26 work items with no production attached are DELETED.
--   · the project and the partner are ARCHIVED. Every partner list filters
--     `archived_at` (`partners.ts` for the CreditOps tree, `agency-partners.ts`
--     for BES Partners), so both disappear from every screen. Archived is not
--     deleted, which is the whole point of having the column (rule 11).
--
-- The two `[TEST]` FIXTURE partners are deliberately untouched: Dee chose to
-- keep them. They are already invisible to every list, and they are what the
-- RLS matrix measures tenant isolation against.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_group uuid := 'b7dbd074-f8b9-4cc3-9835-114a5cb3fdec';
  v_voided int; v_deleted int; v_kept int; v_projects int;
begin
  if not exists (select 1 from public.outsourcing_groups where id = v_group and name = 'Test Partner') then
    raise exception 'b7dbd074… is not the partner named "Test Partner" — refusing to touch it';
  end if;

  /* 1. Void the production. Reason recorded; actor left null because no human
        ran this — a migration is not a person, and naming one would be a
        false audit entry. */
  update public.production_logs
     set is_voided = true,
         void_reason = 'BES CRM test data (Test Partner, September 2026) — voided at Dee''s instruction 2026-09-26',
         voided_at = now()
   where outsourcing_group_id = v_group and not is_voided;
  get diagnostics v_voided = row_count;

  /* 2. Delete the work items nothing was produced against. */
  delete from public.work_items w
   where w.partner_group_id = v_group
     and not exists (select 1 from public.production_logs p where p.work_item_id = w.id);
  get diagnostics v_deleted = row_count;

  select count(*) into v_kept from public.work_items where partner_group_id = v_group;

  /* 3. Archive the project and the partner. */
  update public.crm_projects
     set archived_at = now(),
         archived_reason = 'Test data — removed from the partner list 2026-09-26'
   where partner_group_id = v_group and archived_at is null;
  get diagnostics v_projects = row_count;

  update public.outsourcing_groups
     set archived_at = now(), updated_at = now()
   where id = v_group and archived_at is null;

  raise notice 'voided % production record(s), deleted % work item(s), kept % carrying production, archived % project(s)',
    v_voided, v_deleted, v_kept, v_projects;
end $$;

/* It is gone from every list, and no real partner went with it. */
do $$
declare v_visible int; v_real int; v_counting int;
begin
  select count(*) into v_visible from public.outsourcing_groups
   where not is_fixture and archived_at is null and name ilike '%test%';
  if v_visible > 0 then
    raise exception '% partner(s) with "test" in the name are still visible', v_visible;
  end if;

  /* The six real partners are all still here and unarchived. */
  select count(*) into v_real from public.outsourcing_groups
   where not is_fixture and archived_at is null
     and name in ('Vanquish Ventures','Credit by Nainoa','Business Made Fair',
                  'EDP Management Group','Approve with Tiff','Kevin Hernandez');
  if v_real <> 6 then
    raise exception 'expected 6 imported partners still live, found %', v_real;
  end if;

  /* And nobody else's production was voided by this. */
  select count(*) into v_counting from public.production_logs
   where is_voided and void_reason like 'BES CRM test data (Test Partner%'
     and outsourcing_group_id is distinct from 'b7dbd074-f8b9-4cc3-9835-114a5cb3fdec';
  if v_counting > 0 then
    raise exception '% production record(s) outside Test Partner were voided', v_counting;
  end if;
end $$;

commit;
