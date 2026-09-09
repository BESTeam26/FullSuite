-- =============================================================================
-- Imported partners: put the person in the PERSON field.
--
-- The application reads `outsourcing_groups.partner_name` as the partner's
-- COMPANY (the profile labels it "Company") and keeps the human in
-- `primary_contact`. The ClickUp import (0243) wrote company into `name` and
-- the PERSON into `partner_name`, so every imported profile showed
-- "Company: Lloyd Argame". This moves each imported row's person to
-- `primary_contact` (never overwriting one that exists) and sets
-- `partner_name` to the company, matching how Dee's own hand-entered rows
-- are shaped.
--
-- Idempotent: after the move, partner_name = name and the guard skips.
-- =============================================================================

update public.outsourcing_groups g
   set primary_contact = coalesce(g.primary_contact, g.partner_name),
       partner_name    = g.name
 where g.import_batch_id = '9c2f7a5e-90b1-4e6a-8f43-2026090900aa'
   and regexp_replace(lower(g.partner_name), '[^a-z0-9]', '', 'g')
    <> regexp_replace(lower(g.name),         '[^a-z0-9]', '', 'g');
