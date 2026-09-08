-- 0188 — restoring Dee's dispute statuses, and making them storable.
--
-- ---------------------------------------------------------------------------
-- WHAT I GOT WRONG
--
-- The "After this work" selector offered Dee's real dispute vocabulary —
-- Ready for Round 1, Round Sent - Awaiting Results, Ready for Reimport /
-- Review, Waiting for Partner Approval — and four of those are not values of
-- `fulfillment_client_status`, so they could never be saved. The selector also
-- never wrote a status at all, which is why nobody had noticed.
--
-- I fixed the write and, finding the options unstorable, swapped the list for
-- ALL_STATUS_OPTIONS: Onboarding, Ready for Processing, In Processing, Ready
-- for QA, In Dispute, Awaiting Response, Monitoring Issue, Attention.
--
-- That was the wrong repair. Dee: "In dispute and In waiting is the same.
-- DON'T CHANGE IT. BRING THE ORIGINAL DISPUTE STATUS BACK." The generic list
-- is a different process with overlapping meanings — it describes a file
-- vaguely where the original describes a round precisely.
--
-- The vocabulary was never the problem. The database not accepting it was.
-- So the four missing statuses become real values, the original list comes
-- back, and the write stays fixed.
--
-- Alone in its own migration: `alter type ... add value` cannot share a
-- transaction with a statement that uses the new value.
alter type public.fulfillment_client_status add value if not exists 'Ready for Round 1';
alter type public.fulfillment_client_status add value if not exists 'Round Sent - Awaiting Results';
alter type public.fulfillment_client_status add value if not exists 'Ready for Reimport / Review';
alter type public.fulfillment_client_status add value if not exists 'Waiting for Partner Approval';
