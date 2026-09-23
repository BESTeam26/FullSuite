-- "Mark as mailed" stops rewriting the client's credit status.
--
-- Dee, 2026-09-23, asked whether marking a round mailed should advance the
-- file to the next round or leave it where it is: "no need for this because
-- it's the same as round sent status."
--
-- So there is no round arithmetic to add, and there is something to REMOVE.
-- `mark_client_mailed` set the client's status to 'In Dispute' — a value Dee
-- retired on 2026-09-22 in favour of the twelve `Round N Sent` stages. The
-- agent has already chosen `Round 7 Sent`; that stage IS the waiting state, in
-- Dee's own words on the 22nd ("I need only the Actual Round 1-10 Sent —
-- that's automatically the waiting status"). Overwriting it with a retired
-- one-size status threw away which round was in the post.
--
-- What the action still does, unchanged, is the part that matters: record the
-- mailed date, open the Dispute queue on ROUND SENT - AWAITING RESULTS with
-- the 30-day clock (20260922021000), release the processing agent, and write
-- the activity entry saying when it went and when it comes back.
--
-- No live record holds 'In Dispute', so nothing needs repairing.
--
-- Cost impact: no material increase — this removes an UPDATE.

do $$
declare
  v_def text := pg_get_functiondef('public.mark_client_mailed(uuid, timestamptz)'::regprocedure);
  v_old text := $q$  update public.fulfillment_clients
     set status = 'In Dispute', updated_at = now()
   where id = p_client;$q$;
  v_new text := $q$  /* The stage the agent already chose — `Round N Sent` — is the waiting
     status (Dee, 2026-09-22 and again 2026-09-23). Marking the letters mailed
     records WHEN they went; it does not decide WHAT the file is doing, and
     overwriting the stage here lost which round was in the post. */
  update public.fulfillment_clients
     set updated_at = now()
   where id = p_client;$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'mark_client_mailed no longer sets the status as expected — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* The retired value must not come back through this path. */
do $$
begin
  if position('''In Dispute''' in
       pg_get_functiondef('public.mark_client_mailed(uuid, timestamptz)'::regprocedure)) > 0 then
    raise exception 'mark_client_mailed still writes the retired In Dispute status';
  end if;
end $$;
