-- =============================================================================
-- `refunded` joins the invoice vocabulary.
--
-- Dee's §12 list is Draft · Scheduled · Sent / Open · Partially Paid · Paid ·
-- Past Due · Void · Refunded. Everything but the last already existed.
--
-- Its own migration because `alter type … add value` cannot be used in the
-- same transaction that adds it, and the credit ledger that follows would
-- otherwise be unable to reference it.
-- =============================================================================

alter type public.partner_invoice_status add value if not exists 'refunded';
