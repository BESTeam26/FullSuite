-- 0090 — a new workspace arrives set up, not empty.
--
-- Dee: "after the sign up process they should have auto provision of the
-- account access and account configuration of the owner".
--
-- Provisioning already creates the organization, the owner's membership, the
-- product entitlements and the trial. What it did not do was *configure*
-- anything: only Home and My Work are `always_on`, so an organization that
-- bought Hub Core opened to a workspace with no People, no Announcements, no
-- Knowledge, no Files and no Tools until somebody found the Hub settings and
-- switched each one on. A new owner should not have to discover their own
-- product before they can see it.
--
-- Why this hangs off the entitlement rather than off sign-up: the rule is "you
-- get Hub Core set up when you get Hub Core", and Hub Core can arrive either
-- way — a self-serve sign-up on a plan that includes it, or BES granting it to
-- an existing organization later. One trigger covers both, and neither path
-- has to remember to call anything.
--
-- Layer one of rule 18 is respected by construction: the row that fires this
-- IS the entitlement, so nothing can be switched on that was not bought.
--
-- `on conflict do nothing` matters more than it looks. It makes this the
-- *initial* state and never an override: if the owner switches People off, the
-- row exists with `enabled = false`, and re-granting the entitlement later
-- leaves their decision alone. Layer two stays the customer's (rule 18).
--
-- Only Hub Core. Operations, Performance and AI are separate purchases whose
-- modules change how a company runs; those are the owner's to choose, and the
-- Getting started guide asks them to.

create or replace function public.enable_hub_core_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product <> 'hubCore' or not new.enabled then
    return new;
  end if;
  insert into public.organization_hub_modules (organization_id, module_key, enabled)
  select new.organization_id, m.key, true
    from public.hub_modules m
   where m.package = 'hubCore'
     and m.status = 'available'
     and not m.always_on
  on conflict (organization_id, module_key) do nothing;
  return new;
end $$;
revoke all on function public.enable_hub_core_defaults() from public, anon, authenticated;

create trigger enable_hub_core_defaults_on_entitlement
  after insert or update of enabled on public.product_entitlements
  for each row execute function public.enable_hub_core_defaults();

-- Organizations that already exist and are already entitled were provisioned
-- before this trigger, so they never got the initial state. Give it to them
-- once, with the same "never override a decision" rule.
insert into public.organization_hub_modules (organization_id, module_key, enabled)
select e.organization_id, m.key, true
  from public.product_entitlements e
  join public.hub_modules m
    on m.package = 'hubCore' and m.status = 'available' and not m.always_on
 where e.product = 'hubCore' and e.enabled
on conflict (organization_id, module_key) do nothing;
