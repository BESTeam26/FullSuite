-- "In Dispute Mailed" becomes the round that was actually sent.
--
-- Dee, 2026-09-26: "REMOVE THE In dispute mailed and align them to what ROUND
-- they truly belong to as ROUND SENT."
--
-- 85 clients carry it. Both statuses route to the same place — Dispute ·
-- ROUND SENT - AWAITING RESULTS — so no work moves; what changes is that the
-- file says WHICH round is out, which is the thing an agent needs when the
-- results come back.
--
--   Round 1  →  Round 1 Sent     3
--   Round 2  →  Round 2 Sent     4
--   Round 3  →  Round 3 Sent     8
--   Round 4+ →  Round 4 Sent     2   the enum's fourth value; 5 upward exist
--                                    separately, so the "+" is a label, not a
--                                    range
--   Round 6  →  Round 6 Sent     1
--   Round 8  →  Round 8 Sent     1
--
-- ── SIXTY-SIX ARE NOT CONVERTED, AND THAT IS THE POINT ────────────────────
--
-- The other 66 are on Pre-Round: ClickUp records no round for them. That is
-- not an import fault — only 33 of Approve with Tiff's 72 cards have the
-- Current Round field set at all, and the import read every one that did.
--
-- A dispute round is an FCRA record. "Round 1 Sent" on a file that is
-- actually on round four is not a tidier label, it is a false statement about
-- what was sent to a bureau and when. So they keep "In Dispute Mailed",
-- which is true — something was mailed — until somebody who knows says which
-- round, or the round is read out of the card text.
--
-- Cost impact: no material increase.

begin;

do $$
declare r record; v_total int := 0;
begin
  for r in
    select round::text as round_label,
           ('Round ' || regexp_replace(round::text, '\D', '', 'g') || ' Sent') as sent_status,
           count(*) as n
      from public.fulfillment_clients
     where status = 'In Dispute Mailed'
       and round::text ~ '^Round '
     group by 1, 2
  loop
    /* The target must exist in the enum. "Round 13" has no "Round 13 Sent",
       and a cast that fails takes the whole migration with it rather than
       writing something wrong. */
    if not (r.sent_status = any(enum_range(null::public.fulfillment_client_status)::text[])) then
      raise exception 'no status "%" for round % — % client(s) would be mislabelled',
        r.sent_status, r.round_label, r.n;
    end if;

    update public.fulfillment_clients
       set status = r.sent_status::public.fulfillment_client_status, updated_at = now()
     where status = 'In Dispute Mailed' and round::text = r.round_label;
    v_total := v_total + r.n;
  end loop;

  raise notice '% clients now say which round is out', v_total;
end $$;

/* Nothing moved department, and nothing became actionable. A round in the
   post is waiting on a bureau — Dee's queue doctrine — and converting a
   label must not put 19 files into somebody's queue. */
do $$
declare v_wrong int;
begin
  select count(*) into v_wrong
    from public.fulfillment_clients fc
    join public.client_department_statuses s on s.client_id = fc.id
   where fc.status::text ~ '^Round \d+ Sent$'
     and s.department = 'Dispute'
     and public.creditops_status_is_actionable(s.department, s.status);
  if v_wrong > 0 then
    raise exception '% mailed rounds became actionable work', v_wrong;
  end if;
end $$;

/* And the ones left alone are left alone for the stated reason: no round. */
do $$
declare v_left int; v_with_round int;
begin
  select count(*) into v_left from public.fulfillment_clients where status = 'In Dispute Mailed';
  select count(*) into v_with_round from public.fulfillment_clients
   where status = 'In Dispute Mailed' and round::text ~ '^Round ';
  if v_with_round > 0 then
    raise exception '% clients still say In Dispute Mailed despite having a round', v_with_round;
  end if;
  raise notice '% left on In Dispute Mailed, all of them Pre-Round', v_left;
end $$;

commit;
