-- Phase 6, step 1 of 2: entitlement vocabulary for the two modules that had
-- none (ARCHITECTURE_PROPOSAL_WORKSPACES.md, conflict 6). Enum values must be
-- committed before they can be referenced, so this migration does nothing else.
-- 'crm' keeps its existing meaning: BES CRM delivery visibility (it already
-- gates /app/bes-crm).
alter type public.product_key add value if not exists 'workspaces';
alter type public.product_key add value if not exists 'talentOps';
