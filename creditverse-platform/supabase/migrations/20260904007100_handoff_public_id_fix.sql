-- 0093 — the CreditOps ⇄ FundingOps hand-off works again.
--
-- FOUND BY THE MATRIX, and only because a probe that had been silently
-- skipping was made real. Phase 19's hand-off checks were wrapped in
-- `lakesideFunding ? [...] : [["(no early-stage Lakeside funding client to
-- probe hand-off)", () => "skip", "skip"]]`, and the fixture's only Lakeside
-- funding client had moved past readiness — so the checks had never once run.
--
-- The bug, reproduced against the live database:
--
--   handoff_to_creditops()
--     → update funding_clients set fulfillment_client_id = …
--       → handoff_copy_public_id()            (AFTER UPDATE OF fulfillment_client_id)
--         → update funding_clients set public_id = <the CreditOps client's CN->
--           → assign_client_public_id()        (BEFORE UPDATE OF public_id)
--             → raise 'public_id is immutable'   ← 22023, whole hand-off fails
--
-- So **every hand-off that links a CreditOps client with a different CN- has
-- been failing**, which is every hand-off that creates one. The intent was
-- already in the code and unreachable: the third `if` in the insert branch
-- exists precisely to let a funding row adopt a linked CreditOps CN-, but the
-- `tg_op = 'UPDATE'` guard returns before it is ever reached.
--
-- The fix keeps immutability and carves out the one legitimate change: the
-- funding record adopting the CN- of the CreditOps client it is *linked to*.
-- Not any CN- — that one. A row cannot take another person's identifier,
-- because the value must equal the public_id of the row named by this row's
-- own `fulfillment_client_id`.
--
-- The live definition was read with pg_get_functiondef and diffed against the
-- migration file before this was written (the 0066 lesson: a function can have
-- moved on since the migration that created it — this one had not).

create or replace function public.assign_client_public_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if tg_op = 'UPDATE' then
    if new.public_id is distinct from old.public_id then
      -- The one legitimate change: a funding record adopting the CN- of the
      -- CreditOps client it is linked to, so one person carries one ID across
      -- both products. Anything else is still immutable.
      if not (tg_table_name = 'funding_clients'
              and new.fulfillment_client_id is not null
              and new.public_id is not null
              and new.public_id = (select public_id from public.fulfillment_clients
                                    where id = new.fulfillment_client_id)) then
        raise exception 'public_id is immutable' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;
  -- The column default draws a code; a collision (or a null) is repaired here. The hand-off's
  -- explicit copy of a linked CN- is a same-table uniqueness matter only.
  if new.public_id is not null and not exists (select 1 from public.fulfillment_clients where public_id = new.public_id and id <> new.id)
     and not exists (select 1 from public.funding_clients where public_id = new.public_id and id <> new.id) then return new; end if;
  if new.public_id is not null and tg_table_name = 'funding_clients' and exists (select 1 from public.fulfillment_clients where public_id = new.public_id) then return new; end if;
  loop
    v := public.gen_public_code('CN');
    exit when not exists (select 1 from public.fulfillment_clients where public_id = v) and not exists (select 1 from public.funding_clients where public_id = v);
  end loop;
  new.public_id := v;
  return new;
end $$;
