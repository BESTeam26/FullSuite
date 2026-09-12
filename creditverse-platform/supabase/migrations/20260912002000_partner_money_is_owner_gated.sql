-- =============================================================================
-- Partner money joins the rest of the money.
--
-- Dee, 2026-09-12: "Owner-gate the six partner-money capabilities too… Admin
-- role alone must NOT grant these. Bryan, Rowell, Dian or any other Admin
-- should lose partner billing/revenue access unless explicitly granted. That
-- is intentional."
--
-- ── WHY THE PER-PERSON DENY WAS NOT THE ANSWER ──────────────────────────────
--
-- `resolve_agency_capability` short-circuits for an admin on any key that is
-- not owner-gated — `when m.role in ('agency_owner','agency_admin') then true`
-- — and never consults a per-member row. So an admin cannot be denied a
-- capability; they can only be denied one that is GATED.
--
-- Changing the resolver so a deny beats the role would re-open how every
-- permission in the platform resolves. Dee scoped this deliberately: gate the
-- money keys, leave the resolver alone. The mechanism already exists and is
-- already proved by the five finance keys; these six were simply left out.
--
-- ── WHAT CHANGES FOR REAL PEOPLE ────────────────────────────────────────────
--
-- Every current admin — Bryan, Rowell, Dian — loses partner billing,
-- invoices, payments and revenue until the owner grants it back to them
-- individually. Intended, and stated in writing before it was applied.
--
-- Nothing is deleted and no invoice, payment or revenue row is touched. This
-- is who may READ and WRITE them.
--
--   Owner          → allowed automatically
--   Everybody else → only where the owner granted it, one capability at a time
-- =============================================================================

update public.permission_keys
   set owner_gated = true
 where key in (
   'billing.view', 'billing.manage',
   'partners.invoices.view', 'partners.invoices.manage',
   'partners.payments.record', 'partners.revenue.record'
 );

/* Recorded where an auditor looks, not only in this file. */
do $$
declare v_agency uuid;
begin
  select id into v_agency from public.agencies limit 1;
  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (v_agency, null, 'agency', v_agency::text, null, 'System',
     'Money capabilities gated to the owner',
     'Partner billing, invoices, payments and revenue now follow the same rule as Finance, Expenses and Payroll: the owner has them, and everybody else only where the owner grants it individually (Dee, 2026-09-12).',
     'permission_keys.owner_gated',
     'billing and partner revenue: any admin',
     'billing and partner revenue: owner, or explicitly granted',
     'bes_internal');
end $$;
