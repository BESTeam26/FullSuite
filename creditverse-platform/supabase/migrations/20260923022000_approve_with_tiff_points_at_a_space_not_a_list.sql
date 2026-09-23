-- "Approve with Tiff" was linked to a ClickUp SPACE, not to its client list.
--
-- Its source_list_ref read `clickup:list:90180566841`. That id is the CreditOps
-- space — the container holding every partner's list — so the import would
-- have called /list/90180566841/task and failed, or worse, matched something
-- nobody meant. The partner's actual client list is
-- https://app.clickup.com/25798251/v/l/li/901818050151, "Approve with Tiff -
-- Tiffany Hunter", 85 cards.
--
-- The two other linked partners are left alone and are worth a look before
-- their own imports: Kevin Hernandez carries a plausible list id, and Wavy One
-- Solutions carries `clickup:view:rk9kb-6358`, which is a VIEW reference the
-- importer does not understand at all.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_rows int;
begin
  update public.outsourcing_groups
     set source_list_ref = 'clickup:list:901818050151', updated_at = now()
   where id = '4e8a6a80-f90b-4f66-8bfb-41ce8aa16656'
     and name = 'Approve with Tiff';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'expected exactly one Approve with Tiff partner, updated %', v_rows;
  end if;
end $$;

commit;
