-- The status that means "we are waiting on the client".
--
-- Enum values cannot be used in the transaction that adds them, so this only
-- ADDS the credit status. The department status is plain text, so it needs no
-- declaration; the routing that gives both meaning is the next migration.

alter type public.fulfillment_client_status add value if not exists 'For Client Confirmation';
