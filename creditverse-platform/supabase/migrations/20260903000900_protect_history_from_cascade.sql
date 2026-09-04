-- =============================================================================
-- Stop a parent delete from erasing history
--
-- Migration 0008 made `activity_events` append-only: no DELETE policy, and
-- column-level grants so the values cannot be rewritten. Verified at the time.
-- It had a back door.
--
-- `activity_events.organization_id` was `ON DELETE CASCADE`. Deleting one
-- organization therefore deleted its entire audit trail — no policy consulted,
-- because a foreign-key cascade is not a DELETE statement the caller issued.
-- Demonstrated on 2026-09-03 against the live database: creating a throwaway
-- organization, one client and one status change produced 2 audit events;
-- deleting the organization removed the client AND both events, with no error
-- and no warning.
--
-- The same cascade removed `fulfillment_clients` and `funding_clients` rows —
-- operational history that rule 11 says must be archived, not deleted.
--
-- Two changes:
--
--   1. Audit tables keep their rows when the parent goes. `organization_id`
--      becomes NULL, which the existing RLS reads as agency scope — exactly
--      right: once a customer is gone, only BES staff should see what happened.
--
--   2. Client tables RESTRICT. An organization or outsourcing group holding
--      client records can no longer be deleted at all; it has to be archived
--      through its status, which is what both tables already support.
--
-- Configuration children (businesses, entitlements, memberships, preferences)
-- keep cascading. Those are settings, not history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. History survives its parent
-- -----------------------------------------------------------------------------
alter table public.activity_events
  drop constraint if exists activity_events_organization_id_fkey;
alter table public.activity_events
  add constraint activity_events_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete set null;

-- audit_log was NO ACTION, which blocks the delete outright with a foreign-key
-- error rather than explaining itself. Same treatment: keep the row, drop the
-- pointer, let the RESTRICTs below produce the meaningful message.
alter table public.audit_log
  drop constraint if exists audit_log_organization_id_fkey;
alter table public.audit_log
  add constraint audit_log_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete set null;

-- -----------------------------------------------------------------------------
-- 2. Client records block the delete instead of vanishing with it
-- -----------------------------------------------------------------------------
alter table public.fulfillment_clients
  drop constraint if exists fulfillment_clients_organization_id_fkey;
alter table public.fulfillment_clients
  add constraint fulfillment_clients_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict;

alter table public.fulfillment_clients
  drop constraint if exists fulfillment_clients_outsourcing_group_id_fkey;
alter table public.fulfillment_clients
  add constraint fulfillment_clients_outsourcing_group_id_fkey
  foreign key (outsourcing_group_id) references public.outsourcing_groups(id)
  on delete restrict;

alter table public.funding_clients
  drop constraint if exists funding_clients_organization_id_fkey;
alter table public.funding_clients
  add constraint funding_clients_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict;

alter table public.funding_clients
  drop constraint if exists funding_clients_outsourcing_group_id_fkey;
alter table public.funding_clients
  add constraint funding_clients_outsourcing_group_id_fkey
  foreign key (outsourcing_group_id) references public.outsourcing_groups(id)
  on delete restrict;

-- Production and delivery records are the ledger this business bills from, so
-- they outlive the organization they were performed for.
alter table public.production_logs
  drop constraint if exists production_logs_organization_id_fkey;
alter table public.production_logs
  add constraint production_logs_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete set null;

alter table public.webhook_deliveries
  drop constraint if exists webhook_deliveries_client_id_fkey;
alter table public.webhook_deliveries
  add constraint webhook_deliveries_client_id_fkey
  foreign key (client_id) references public.fulfillment_clients(id)
  on delete set null;
