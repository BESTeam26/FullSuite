-- Business Made Fair is linked to its ClickUp list.
--
-- Dee sent https://app.clickup.com/25798251/v/l/rk9kb-21118 — a view of
-- "BMF - Samiyrah Robinson", list 901817425142, 144 cards.
--
-- Only the LINK is set here. Three other things stand between those clients
-- and the team, and none of them is mine to decide:
--
--   the partner is SUSPENDED      nonpayment, since 2026-09-20, citing
--                                 invoice BES-2026-00464 unpaid 7 days past
--                                 its due date
--   the CreditOps engagement is   paused since 2026-09-12
--     PAUSED
--   no live team is assigned      so only administrators could open the
--                                 files even if the first two were cleared
--
-- Kevin Hernandez's suspension turned out to be wrong and Dee said so. This
-- one names an invoice and a number of days, which is a different kind of
-- record — it reads like the billing sweep did it, not like somebody typed
-- it. Lifting a nonpayment suspension is a money decision and it is hers.
--
-- Worth her knowing while she decides: BES invoicing was switched off on
-- 2026-09-22, two days after this was raised, when she moved it to
-- GoHighLevel. So the invoice this cites may no longer reflect what BMF
-- actually owes.
--
-- The clients import regardless — importing writes records, it does not
-- grant anybody access — and they will sit out of the queues until the
-- engagement and the suspension say otherwise.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_rows int;
begin
  update public.outsourcing_groups
     set source_list_ref = 'clickup:list:901817425142', updated_at = now()
   where name = 'Business Made Fair';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'expected exactly one Business Made Fair partner, updated %', v_rows;
  end if;
end $$;

commit;
