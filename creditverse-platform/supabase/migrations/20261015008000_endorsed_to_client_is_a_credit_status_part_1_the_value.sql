-- "Endorsed to Client" is a credit status (part 1 of 2: the enum value).
--
-- A new enum value cannot be used in the transaction that adds it, so it is
-- added here, alone, and 20261015009000 wires it.
alter type public.fulfillment_client_status add value if not exists 'Endorsed to Client';
