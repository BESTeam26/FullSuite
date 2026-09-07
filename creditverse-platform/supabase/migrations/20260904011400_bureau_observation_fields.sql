-- 0136 — Six fields a source exposes and BES had nowhere to put.
--
-- SmartCredit mapper milestone. Approved by Dee 2026-09-07 from the mapping
-- spec at docs/creditops/sources/SMARTCREDIT_SOURCE_MAPPING.md, which found 22
-- tradeline fields in the source, 16 of them already canonical.
--
-- These are the other six. Additive, nullable, on the table CR-2 created — no
-- new table, no policy change, no grant change. Authorization, append-only
-- behaviour and the raw_metro2_verified invariant are all inherited unchanged.
--
-- ---------------------------------------------------------------------------
-- ONE TRADELINE IS ONE report_item. These are its per-bureau values.
--
-- The reason that needs saying in a migration: without these columns, a mapper
-- reading a source that exposes "Last Verified" and "Dispute Status" has two
-- choices — drop them, or emit them as separate report items. The second
-- produces an import preview of hundreds of rows named "Last Verified" and
-- "Dispute Status" instead of one row per account, and it makes a field
-- masquerade as a tradeline. Columns are the cheap fix.
-- ---------------------------------------------------------------------------

alter table public.report_item_bureau_values
  add column if not exists responsibility_raw  text,
  add column if not exists dispute_status      text,
  add column if not exists account_rating      text,
  add column if not exists creditor_type       text,
  add column if not exists payment_frequency   text,
  add column if not exists last_verified       text;

/**
 * Stored as the source printed it — "Individual", "Joint", "Authorized User".
 *
 * `_raw` is in the name to keep a promise: this is NOT an ECOA / Account
 * Designator code. A consumer report prints a translated word, and recording
 * that word as if it were the furnisher's transmitted designator is the same
 * error as recording a consumer display as raw Metro 2. It MAY support
 * responsibility normalisation later; a normalised column would be a separate,
 * derived thing, and it would name its source.
 */
comment on column public.report_item_bureau_values.responsibility_raw is
  'Responsibility as the source printed it (e.g. "Individual"). NOT an ECOA code — see the Rulebook §6. Never normalise in place.';

/**
 * The bureau's own answer to "is this account marked as disputed", which is
 * different from ours.
 *
 * `condition-detector`'s `not_notated_as_disputed` reads OUR record of what we
 * sent. This reads the bureau's. Both are useful and neither is a legal
 * conclusion: it is an observed consumer-report field, and it does not
 * establish a § 1692e(8) issue or a furnisher's failure.
 */
comment on column public.report_item_bureau_values.dispute_status is
  'Dispute notation as the source reports it. An OBSERVED field, never a legal conclusion.';

comment on column public.report_item_bureau_values.account_rating is
  'The bureau''s own rating token, verbatim. Raw-only: no rule reads it until its vocabulary is confirmed against several real reports.';

comment on column public.report_item_bureau_values.creditor_type is
  'Furnisher category as the source classifies it (e.g. "Bank"). Raw-only.';

comment on column public.report_item_bureau_values.payment_frequency is
  'Payment frequency as stated (e.g. "Monthly"). Raw-only.';

/**
 * A SECOND date, and deliberately not folded into account_information_date.
 *
 * "Date Reported" and "Last Verified" are different questions — when the
 * furnisher last sent data, and when the bureau last confirmed it. Conflating
 * them would lose exactly the comparability signal the chronology work (CR-3)
 * needs to ask "same reporting period?".
 */
comment on column public.report_item_bureau_values.last_verified is
  'When the bureau last verified this item, as the source states it. Distinct from account_information_date; never conflate the two.';
