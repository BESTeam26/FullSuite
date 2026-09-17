-- One writer for an invoice's status.
--
-- Dee §4: "Clarify whether `overdue` is stored or derived. My preference:
-- payment state stored, overdue derived from due date + balance. This avoids a
-- second status drifting from reality."
--
-- ── THE DRIFT WAS REAL, AND MEASURABLE ────────────────────────────────────
--
-- Two functions wrote `partner_invoices.status`:
--
--   `partner_invoice_recompute` — fires on every payment, and sets
--     partially_paid when anything has been paid, overdue when nothing has.
--   `mark_overdue_invoices`     — runs hourly, and sets overdue on anything
--     in ('sent', 'partially_paid') that is past its due date.
--
-- They disagree about a partially-paid invoice that is late. The payment
-- trigger calls it partially_paid; the hourly sweep calls it overdue; each
-- overwrites the other. The status of that invoice depended on which ran last.
--
-- ── WHY NOT REMOVE THE STORED VALUE ENTIRELY ──────────────────────────────
--
-- Measured before deciding: 15 database functions and 4 views read
-- `status = 'overdue'`, plus the portal and Finance screens. Making it purely
-- derived is a coherent design and a wide, separate change — it is written up
-- in the architecture report as the one open decision for Dee, not taken here.
--
-- What IS fixed here is the thing that made it drift: there is now exactly one
-- writer. `mark_overdue_invoices` stops writing and asks the recompute
-- instead, so both paths produce the same answer by construction.
--
-- The rule, stated plainly so nobody has to infer it:
--
--   paid           — the balance is zero
--   partially_paid — something has been paid and something is still owed
--   overdue        — NOTHING has been paid and the due date has passed
--   sent           — nothing has been paid and it is not yet due
--
-- So "partially paid" outranks "overdue" on the same invoice. Every query that
-- looks for money owed already reads all three together, and the ageing in
-- Finance is computed from `due_date`, not from this column.

create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int := 0;
  r record;
begin
  /* Candidates by the facts, then ONE writer decides what to store. This used
     to be an UPDATE of its own, which is how it came to disagree with the
     payment trigger about the same invoice. */
  for r in
    select i.id from public.partner_invoices i
     where i.status in ('sent', 'partially_paid')
       and i.due_date < current_date
       and public.invoice_balance_cents(i.id) > 0
  loop
    perform public.partner_invoice_recompute(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

comment on function public.mark_overdue_invoices() is
  'Re-derives the status of invoices that have fallen past due. It does NOT write status itself: partner_invoice_recompute is the single writer, which is why the two can no longer disagree about a partially-paid late invoice (Dee §4).';

/* Whether an invoice is late, asked directly rather than inferred from a
   status that also has to carry payment state. This is the derived answer
   Dee prefers, available now to anything that wants it. */
create or replace function public.invoice_is_overdue(p_invoice uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select i.status not in ('draft', 'scheduled', 'void', 'cancelled', 'paid', 'refunded')
       and i.due_date < current_date
       and public.invoice_balance_cents(i.id) > 0
      from public.partner_invoices i where i.id = p_invoice
  ), false)
$$;

comment on function public.invoice_is_overdue(uuid) is
  'Derived from the due date and the balance, never from the stored status — so it is right for a partially-paid invoice that is also late, which the status column cannot express.';

grant execute on function public.invoice_is_overdue(uuid) to authenticated;

/* The guard let the recompute through by id. `mark_overdue_invoices` now goes
   through the recompute too, so nothing else needs an exemption — and the
   guard stays as narrow as it was. */
