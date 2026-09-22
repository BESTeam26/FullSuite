-- `Outsourcing - Unpaid` opens in Support as a billing issue.
--
-- Dee, 2026-09-22: *"this is the status for our per account that is ready for
-- dispute BUT has outstanding balance with BES for payment"*, and asked who
-- chases it: *Support chases the balance* — opened in Support, assigned, so
-- somebody is actually collecting, with the dispute work held until it clears.
--
-- `BILLING ISSUE` is already Support's word for exactly this, so the status
-- reuses it rather than adding a second one. Dispute is deliberately NOT
-- opened: the file is ready for a round and is not going to get one while the
-- balance stands, and an untouchable row in the Dispute queue is the kind of
-- false work this whole clean-up is removing.
--
-- Separate from 20260922009000 only because Postgres will not let an enum
-- value be used in the transaction that added it.

insert into public.creditops_status_routing (status, department, kind, entry_status, note)
values ('Outsourcing - Unpaid', 'Support', 'actionable', 'BILLING ISSUE',
        'Ready for dispute, but the partner has an outstanding balance with BES. Support collects; no round goes out until it clears.')
on conflict (status) do update
  set department = excluded.department, kind = excluded.kind,
      entry_status = excluded.entry_status, note = excluded.note;
