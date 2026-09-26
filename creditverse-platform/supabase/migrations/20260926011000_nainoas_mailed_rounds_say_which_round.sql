-- Credit by Nainoa's book joins the rule the others already follow.
--
-- Dee, 2026-09-26: "REMOVE THE In dispute mailed and align them to what ROUND
-- they truly belong to as ROUND SENT." — applied once on 20260926004000 over
-- the book that existed then, and applied again here because 637 more clients
-- arrived afterwards. Same rule, same guards, no new logic: a standing
-- instruction that only ran once is an instruction that quietly stops being
-- true the next time somebody imports a list.
--
-- 173 of the 328 carrying "In Dispute Mailed" have a round recorded:
--
--   Round 1   99      Round 6    8      Round 9    4
--   Round 2   16      Round 7    5      Round 10   3
--   Round 5   13      Round 3    9      Round 11   3
--   Round 4+  10      Round 8    3
--
-- ── 155 ARE NOT CONVERTED, AND THAT IS STILL THE POINT ────────────────────
--
-- They are Pre-Round: ClickUp records no round for them. A dispute round is an
-- FCRA record. "Round 1 Sent" on a file actually on round four is not a tidier
-- label, it is a false statement about what was sent to a bureau and when.
-- They keep "In Dispute Mailed", which is true, until somebody who knows says
-- which round.
--
-- Nothing moves department: "In Dispute Mailed" and "Round N Sent" both route
-- to Dispute · ROUND SENT - AWAITING RESULTS. What changes is that the file
-- says WHICH round is out, which is what an agent needs when results arrive.
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

/* Nothing became actionable. A round in the post is waiting on a bureau —
   Dee's queue doctrine §23 — and converting a label must never put files into
   somebody's queue. */
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
