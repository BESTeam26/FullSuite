-- The thirty-day wait has to END, not just move the client along.
--
-- 20260922006000 gave a sent round a 30-day clock and moved the CLIENT status
-- to `Ready for Credit Review` on expiry, deliberately leaving the department
-- row alone so the routing trigger could open Support without colliding.
--
-- It left the Dispute row on `ROUND SENT - AWAITING RESULTS` with a due date
-- that had already passed. `sla_sweep` selects every row whose due date is in
-- the past, so it picked the same rows up again an hour later, and would have
-- done so every hour for ever: four "Back for review" entries on two clients
-- between 05:20 and 06:20 Eastern on 2026-09-22, and three assignments made
-- twice. Caught by the Complaints agent matrix probe, which noticed an agent
-- could suddenly see queue rows in departments that are not theirs — the
-- policy lets you see a row ASSIGNED to you, and the loop had been assigning.
--
-- ── WHY CLOSING IT IS THE RIGHT ANSWER, NOT A LONGER CLOCK ────────────────
--
-- The wait genuinely finished. Dispute's work on that round was "the round is
-- in the post"; the post has arrived. Support reviews the results, and Dispute
-- opens again when the next round is sent. Marking the row COMPLETED says
-- that, and a closed status carries no SLA policy, so the row falls out of the
-- sweep instead of being re-examined hourly.
--
-- The department is not changed here — only the status — so nothing moves
-- between departments and the (client, department) key cannot collide.

update public.sla_policies
   set on_expiry_status = 'COMPLETED',
       on_expiry_department = null
 where department = 'Dispute'
   and status = 'ROUND SENT - AWAITING RESULTS';

-- ── Stop the two that are already looping ─────────────────────────────────
/* They have been moved on correctly — the client status is right and Support
   holds them. Only the stale Dispute row is left, still overdue and still
   being re-swept. Closed here so the loop ends now rather than at the next
   deploy. */
update public.client_department_statuses s
   set status = 'COMPLETED', updated_at = now()
  from public.fulfillment_clients c
 where c.id = s.client_id
   and s.department = 'Dispute'
   and s.status = 'ROUND SENT - AWAITING RESULTS'
   and coalesce(s.manual_due_at, s.system_due_at) <= now()
   and c.status = 'Ready for Credit Review';
