-- Pilot defect P-030: "Database error loading user" on Activate my account.
--
-- Migration 20260920001800 staged five invited people as shell accounts by
-- inserting straight into auth.users, naming only the columns it cared
-- about. Supabase Auth (GoTrue) reads its token columns into non-nullable Go
-- strings, so a row with NULL in confirmation_token, recovery_token,
-- email_change or email_change_token_new cannot be loaded at all — every
-- sign-in, password set or admin update for that person fails with
-- "Database error loading user". GoTrue's own createUser writes '' there,
-- which is why accounts made through the create-team-member function work.
--
-- Repair: give the staged rows the empty strings GoTrue expects. Idempotent,
-- touches only rows that are NULL, changes nothing about who the person is.
-- Rule going forward (recorded in PILOT_ISSUES P-030): shell accounts are
-- created through auth.admin.createUser, never by SQL insert.

update auth.users
   set confirmation_token        = coalesce(confirmation_token, ''),
       recovery_token            = coalesce(recovery_token, ''),
       email_change              = coalesce(email_change, ''),
       email_change_token_new    = coalesce(email_change_token_new, ''),
       email_change_token_current= coalesce(email_change_token_current, ''),
       phone_change              = coalesce(phone_change, ''),
       phone_change_token        = coalesce(phone_change_token, ''),
       reauthentication_token    = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
