-- 0144 — a BES Partner is a real record with a real portal, and no tenant.
--
-- ---------------------------------------------------------------------------
-- WHY NOT AN ORGANIZATION
--
-- Portal access has only ever run through `external_memberships`, whose
-- `organization_id` is NOT NULL. So giving a partner a login meant inventing a
-- customer Organization to hold them — which puts a partner inside the SaaS
-- tenant boundary, gives them an entitlement surface they never bought, and
-- makes every "which organization is this?" query answer wrong.
--
-- Rule 16 already says a partner is not a subclass of an organization, and
-- model 3 (BES fulfilment WITHOUT SaaS) exists precisely because a partner can
-- have no organization at all. So the partner's own record IS the boundary:
-- a contact belongs to an `outsourcing_group`, and that is what they can see.
--
-- ---------------------------------------------------------------------------
-- WHAT A PARTNER NEEDS TO BE CREATED
--
-- A name and an email. Nothing else. A phone number that is not to hand must
-- never stop somebody recording a partner they just agreed terms with — an
-- empty field is honest, and a form that refuses is how records end up with
-- "n/a" typed into them.
-- ---------------------------------------------------------------------------

-- ── Lifecycle: active, suspended, archived ───────────────────────────────
alter type public.outsourcing_group_status add value if not exists 'Suspended';
alter type public.outsourcing_group_status add value if not exists 'Archived';
