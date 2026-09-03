-- =============================================================================
-- BES Platform — Migration 0006: revoke table privileges from anon, by default
-- =============================================================================
-- Migration 0004 revoked table privileges from `anon` for the tables that
-- existed at that moment, and set default privileges for FUNCTIONS only. Tables
-- created afterwards (the Phase 3 fulfillment tables) therefore picked up
-- Supabase's default grant to `anon` again: an anonymous caller could query
-- them and was stopped only by RLS returning zero rows.
--
-- RLS doing its job is not a reason to leave the grant in place. Rule 1 is
-- default-to-deny in more than one layer, so a future table added without a
-- policy fails closed instead of leaking.
--
-- This is the third form of the same trap (see 0003 for anon EXECUTE, 0004 for
-- the inherited PUBLIC EXECUTE). Setting DEFAULT PRIVILEGES for tables here
-- means it cannot recur for tables added later.
-- =============================================================================

-- Existing tables, including everything Phase 3 added.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Future tables and sequences in this schema.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- `authenticated` keeps what the policies expect; RLS still filters every row.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
