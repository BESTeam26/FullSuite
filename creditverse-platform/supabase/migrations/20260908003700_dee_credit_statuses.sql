-- 0214 — Dee's credit status list. The values, added verbatim.
--
-- ---------------------------------------------------------------------------
-- DEE'S LIST, GIVEN EXPLICITLY
--
--   New Client
--   Incomplete Onboarding
--   Ready for Round 1
--   Ready for Processing
--   Prio Processing
--   For Complaints
--   Round Sent - Awaiting Results
--   Ready For Reimport/ Credit Update
--   On Hold (Non Workable)
--   For Partner Confirmation
--
-- Three of the ten already exist in `fulfillment_client_status` exactly:
-- "Ready for Round 1", "Ready for Processing", "Round Sent - Awaiting
-- Results". The other seven do not exist at all, in any casing:
--
--   New Client                          (the enum has "NEW ONBOARDING")
--   Incomplete Onboarding               (the enum has "INCOMPLETE ONBOARDING")
--   Prio Processing                     (absent)
--   For Complaints                      (absent)
--   Ready For Reimport/ Credit Update   (the enum has "Ready for Reimport / Review")
--   On Hold (Non Workable)              (absent)
--   For Partner Confirmation            (the enum has "Waiting for Partner Approval")
--
-- ---------------------------------------------------------------------------
-- ADDED VERBATIM, AND NOTHING RENAMED
--
-- Added with Dee's own spelling, spacing and capitalisation — including
-- "Ready For Reimport/ Credit Update" with its capital F and its unspaced
-- slash — so that what is stored is what Dee wrote and what a screen shows.
-- The alternative is a display-label layer over a differently-spelled stored
-- value, which is one more place for the two to disagree, and this is the
-- vocabulary that has already been lost once by somebody tidying it.
--
-- Nothing is renamed and nothing is removed. Existing clients keep the value
-- they hold, and the control offers a record's own current value even when it
-- is not on the list — a dropdown that omits what the record says looks as
-- though it has already changed it. Dee, §12: the vocabulary is not ours to
-- edit.
--
-- ---------------------------------------------------------------------------
-- WHY THIS MIGRATION CONTAINS NOTHING ELSE
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds
-- it. Anything else in this file — a policy, a function, a backfill that
-- mentions one of these values — would fail. It has bitten this project
-- before, which is why the rule is written down: one migration, only the
-- ALTER TYPEs.
-- ---------------------------------------------------------------------------

alter type public.fulfillment_client_status add value if not exists 'New Client';
alter type public.fulfillment_client_status add value if not exists 'Incomplete Onboarding';
alter type public.fulfillment_client_status add value if not exists 'Prio Processing';
alter type public.fulfillment_client_status add value if not exists 'For Complaints';
alter type public.fulfillment_client_status add value if not exists 'Ready For Reimport/ Credit Update';
alter type public.fulfillment_client_status add value if not exists 'On Hold (Non Workable)';
alter type public.fulfillment_client_status add value if not exists 'For Partner Confirmation';
