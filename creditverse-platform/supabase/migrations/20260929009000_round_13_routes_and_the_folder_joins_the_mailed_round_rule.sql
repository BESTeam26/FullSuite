-- Round 13 Sent routes like every other round, and the folder's partners
-- join the mailed-round rule.
--
-- Two things, in this order because the second needs the first:
--
-- 1. The routing row. `creditops_status_routing` is the canonical answer to
--    "which department does this status put a file in"; "Round 13 Sent" gets
--    exactly the row "Round 12 Sent" has — Dispute, waiting, entering at
--    ROUND SENT - AWAITING RESULTS. Copied from that row rather than typed,
--    so the two cannot differ.
--
-- 2. The conversion. Dee, 2026-09-26: "REMOVE THE In dispute mailed and align
--    them to what ROUND they truly belong to as ROUND SENT." Applied to every
--    list as it arrived; applied now to the thirteen lists of the BES
--    OUTSOURCING CLIENTS folder. Same guards: a round with no matching Sent
--    status refuses, and nothing may become actionable — a round in the post
--    is waiting on a bureau (§23). Files with no recorded round keep
--    "In Dispute Mailed", which is true; a dispute round is an FCRA record.
--
-- Cost impact: no material increase.

begin;

insert into public.creditops_status_routing
  (status, department, kind, entry_status, note, on_resolved_status, closes_department)
select 'Round 13 Sent'::public.fulfillment_client_status,
       r.department, r.kind, r.entry_status,
       'Completes the Round N Sent series to match fulfillment_round (2026-09-29).',
       r.on_resolved_status, r.closes_department
  from public.creditops_status_routing r
 where r.status = 'Round 12 Sent'
on conflict (status) do nothing;

do $$
begin
  if not exists (select 1 from public.creditops_status_routing where status = 'Round 13 Sent') then
    raise exception 'Round 13 Sent has no routing row — the copy from Round 12 Sent found nothing';
  end if;
end $$;

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

do $$
declare v_wrong int; v_left int; v_with_round int;
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

  select count(*) into v_left from public.fulfillment_clients where status = 'In Dispute Mailed';
  select count(*) into v_with_round from public.fulfillment_clients
   where status = 'In Dispute Mailed' and round::text ~ '^Round ';
  if v_with_round > 0 then
    raise exception '% clients still say In Dispute Mailed despite having a round', v_with_round;
  end if;
  raise notice '% left on In Dispute Mailed, all of them without a recorded round', v_left;
end $$;

commit;
