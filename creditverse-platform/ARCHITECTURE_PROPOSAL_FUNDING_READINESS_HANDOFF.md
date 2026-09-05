# Proposal — CreditOps ⇄ FundingOps hand-off (funding readiness)

**Status: proposal (2026-09-04). Nothing built.** Dee's goal: an organization
offering both services moves a funding lead into CreditOps for funding
readiness and back into FundingOps once qualified — one person, one history.

## What exists (verified)
- `funding_clients.fulfillment_client_id` — a nullable link from a funding
  client to a CreditOps client. Set by nothing in the interface today.
- `fetchCrossDivisionMatches` / `useCrossDivisionMatches` — finds CreditOps
  clients with the same email; **no screen uses it**.
- No reverse link on `fulfillment_clients`; no funding status expresses "in
  credit repair"; no transfer action; no shared activity across the two records.

## Prerequisite found while reading the policies (decision needed)

Since migration 0027 (§E), **only BES may insert or update `fulfillment_clients`
and `funding_clients`**: both policies require `bes_may_fulfil(...)` and
`in_scope(...)`. Organization members can SELECT their own clients (the select
policies carry an `org_has_product … org_scope_allows` branch) but any status
change, new client or hand-off they attempt is refused by the database. The
organization CreditOps / FundingOps workspaces therefore read correctly today
but cannot write — an organization is a SaaS customer that owns its own
operations (rule 16, model 1), so this is a gap, not a safeguard.

Proposed organization branch (permissive OR, own organization only, entitled
product only, no BES data reachable):

```
insert:  organization_id is not null
         and public.org_has_product(organization_id, '<product>')
         and public.is_org_admin(organization_id)          -- admins/managers mint clients
         and agency_id = public.org_agency(organization_id)
update:  organization_id is not null
         and public.org_has_product(organization_id, '<product>')
         and public.org_scope_allows(organization_id, assigned_agent_id)   -- same reach as select
```

Outsourcing-group clients (model 3) stay BES-only. This is a policy change and
is **not applied until Dee confirms**; the migration is drafted.

## Design
1. **One link, both ways readable.** Keep `funding_clients.fulfillment_client_id`
   as the single FK (rule 2: no duplicate person). Add a view or query for the
   CreditOps side ("linked funding client") — no second column to drift.
2. **Two deterministic transitions** in `lib/fulfillment/handoff-domain.ts`:
   - *Send to CreditOps for readiness* (from a FundingOps client): requires
     entitlement to creditOps; creates the CreditOps client if none is linked
     (same name/email/phone, same organization, `mode` from the org's model,
     status `Onboarding`, round `Pre-Round`) or links the existing match by
     email after the agent confirms it is the same person; sets the funding
     status to **`Credit Readiness`** (new enum value, active, before Readiness
     Review); writes one activity event on each record ("Sent to CreditOps for
     funding readiness" / "Received from FundingOps"), visibility
     organization_internal.
   - *Return to FundingOps — qualified* (from the CreditOps client): requires
     a linked funding client; sets funding status to `Readiness Review`;
     activity on both records; the CreditOps record keeps its own status
     (credit work may continue).
   Both run through one RPC each (`handoff_to_creditops`, `handoff_to_fundingops`,
   SECURITY INVOKER so existing policies on both tables decide), atomic, no
   client-side multi-step writes.
3. **Surfaces.** FundingOps client workspace: "Funding readiness" card with the
   linked CreditOps status and the *Send to CreditOps* action; CreditOps client
   workspace: "Funding" card with the linked funding status and *Return to
   FundingOps — qualified*. Home cards: "In credit readiness" under FundingOps.
4. **Reporting.** Time in `Credit Readiness`, readiness → funded conversion,
   from the two records' activity — no new tables.

## Authorization
Unchanged chain. The actor must already see and write both records under the
existing policies (organization member with both entitlements, or BES under
engagements for both services); the RPCs add no bypass. Matrix phase: an
organization with only fundingOps cannot send to CreditOps; another
organization cannot link; BES agent out of scope cannot.

## Migration
One: `alter type funding_client_status add value 'Credit Readiness'`; the two
RPCs; a `linked_funding_client` view; grants/revokes.
