-- A voided invoice owes nothing, and must say so on its own row.
--
-- Found during the 2026-09-16 production release certification, by reading the
-- live Partner Portal as a real partner contact rather than by reading code.
--
-- WHAT THE PARTNER SAW
--
--   INV-TEST-EMAIL   Sep 5, 2026   Sep 12, 2026   $125.00   $125.00   [Void]
--                                                            ^^^^^^^
--
-- The Current Balance card above it correctly read "$0.00 — nothing
-- outstanding", because `my_partner_portal_summary` and `my_partner_billing`
-- both filter `status not in ('void','cancelled','draft')` before summing. So
-- the totals were never wrong. Only the row was, and it was wrong in the most
-- alarming possible place: a Balance column on a money page.
--
-- WHY ONLY THIS FUNCTION CHANGES
--
-- The obvious fix is to teach `invoice_balance_cents` about void. It is the
-- wrong fix. That function is raw arithmetic — total minus paid — and ten
-- things call it, including `record_partner_payment`, `apply_account_credit`
-- and the reminder and reactivation sweeps. Every one of those that aggregates
-- money ALREADY excludes void by status, so they do not need the function to
-- do it again; and `record_partner_payment` wants the true arithmetic, not a
-- status-aware version of it, or posting a correction against a voided invoice
-- would silently compute against zero.
--
-- `my_partner_invoices` is the only caller that reports a per-row balance
-- without a status filter, because it deliberately lists void invoices — a
-- partner should be able to see that something was cancelled. It just must not
-- put a number in the Balance column when nothing is owed.
--
-- Smallest coherent change: the display function reports what is actually owed.

create or replace function public.my_partner_invoices()
returns table (
  id uuid, invoice_number text, issue_date date, due_date date, currency text,
  total_cents bigint, amount_paid_cents bigint, balance_cents bigint,
  status text, period_key text, notes text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.id, i.invoice_number, i.issue_date, i.due_date, i.currency,
         i.total_cents, i.amount_paid_cents,
         /* Cancelled means cancelled. The invoice stays listed so the partner
            can see it happened; the amount owed on it is nought. */
         case when i.status in ('void', 'cancelled') then 0::bigint
              else public.invoice_balance_cents(i.id) end,
         i.status::text, i.period_key, i.notes
    from public.partner_invoices i
   where i.group_id = public.partner_billing_group_of_user()
     and i.status <> 'draft'
   order by i.issue_date desc, i.invoice_number desc
   limit 200
$$;

comment on function public.my_partner_invoices() is
  'The partner''s own invoices. A voided or cancelled invoice reports a balance of zero — it stays in the list so the partner can see it was cancelled, but nothing is owed on it.';
