-- Where each new pipeline stage sends the work, and the one fact it must not
-- contradict.
--
-- `creditops_status_routing` is what actually puts a client in a queue: a
-- status with no row here is a label nobody works. So every stage added in
-- 005000 gets a department, a kind and the department status it enters at,
-- chosen to match the stage it sits beside in the locked model.
--
-- ── THE ROUND IS ALREADY A FACT ───────────────────────────────────────────
--
-- `fulfillment_clients.round` has held Round 1…Round 13 since long before
-- this. "Round 3 Sent" therefore states, in a second place, something the
-- record already knows — and two places holding one truth is how one truth
-- becomes several (rules 2 and 5). The status would say Round 3 while the
-- round column said Round 5, and nothing would reconcile them.
--
-- Rather than drop the stages Dee asked for, the status DRIVES the round:
-- setting "Round 7 Sent" sets the round to Round 7, in the same statement,
-- deterministically. They cannot disagree because only one of them is
-- written by hand.

insert into public.creditops_status_routing (status, department, kind, entry_status, note)
values
  /* A round in flight is waiting on the bureaus, exactly like the
     "Round Sent - Awaiting Results" stage it makes specific. */
  ('Round 1 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 2 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 3 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 4 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 5 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 6 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 7 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 8 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 9 Sent',  'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 10 Sent', 'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 11 Sent', 'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  ('Round 12 Sent', 'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS', 'GHL pipeline stage.'),
  /* Letters are out and the clock is the bureaus' — waiting, in Dispute,
     beside the existing "In Dispute". */
  ('In Dispute Mailed', 'Dispute', 'waiting', 'ROUND SENT - AWAITING RESULTS',
   'Letters mailed; awaiting the bureaus.'),
  /* A credit-monitoring problem is somebody's to chase, and Support already
     owns "Monitoring Issue". Three levels, same door, escalating. */
  ('CMS Issue 1', 'Support', 'actionable', 'MONITORING ISSUE', 'Credit monitoring issue, first notice.'),
  ('CMS Issue 2', 'Support', 'actionable', 'MONITORING ISSUE', 'Credit monitoring issue, second notice.'),
  ('CMS Issue 3', 'Support', 'actionable', 'MONITORING ISSUE', 'Credit monitoring issue, third notice.'),
  /* Results are back and somebody must read them — the same work the locked
     "Ready For Reimport/ Credit Update" describes. */
  ('Results Available for Review', 'Support', 'actionable', 'READY FOR REIMPORT',
   'Bureau results are in and waiting to be read.')
on conflict (status) do update
  set department = excluded.department, kind = excluded.kind,
      entry_status = excluded.entry_status, note = excluded.note;

/**
 * "Round 7 Sent" means the round is 7.
 *
 * Only the status is set by hand; the round follows it. Before this the two
 * were independent and a client could sit at "Round 3 Sent" with a round of
 * 5. A status that does not name a round leaves the round alone — moving to
 * Support does not reset which round the client reached.
 */
create or replace function public.round_follows_the_status() returns trigger
language plpgsql set search_path = public as $function$
declare v_n text;
begin
  v_n := substring(new.status::text from '^Round ([0-9]+) Sent$');
  if v_n is not null then
    new.round := ('Round ' || v_n)::public.fulfillment_round;
  end if;
  return new;
end $function$;

drop trigger if exists fulfillment_clients_round_follows_status on public.fulfillment_clients;
create trigger fulfillment_clients_round_follows_status
  before insert or update of status on public.fulfillment_clients
  for each row execute function public.round_follows_the_status();

comment on trigger fulfillment_clients_round_follows_status on public.fulfillment_clients is
  'A "Round N Sent" status sets round to Round N. The round is a fact the record already held; this keeps the two from disagreeing (rules 2 and 5).';
