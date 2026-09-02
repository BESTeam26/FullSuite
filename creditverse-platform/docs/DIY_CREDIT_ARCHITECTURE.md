# BES DIY Credit — Architecture

> **Status markers:** ✅ Frontend Complete · 🟡 Demo Only · 🔴 Backend Required · 🔴 Provider Integration Required · 🔴 Billing Required · 🔴 Compliance Review Required

## Model

BES DIY Credit is a **B2B2C white-label SaaS**.

- BES sells the software to an **Organization**.
- That Organization offers the DIY credit experience to its **own consumers** under its brand.
- BES does **not** sell DIY Credit directly to consumers in this model.

```
Organization → DIY Credit Program → Consumer → DIY Credit Journey
```

A consumer may later move:
- DIY → CreditOps (request professional help)
- DIY → Funding Readiness → FundingOps
- CreditOps → FundingOps

**Never create duplicate people.** One Client can have multiple service enrollments and records.

## Independence

DIY Credit must be an independent Organization capability. Valid setups:
- DIY only
- DIY + CreditOps
- DIY + FundingOps
- DIY + CreditOps + FundingOps
- Full Suite

DIY must **not** require CreditOps, FundingOps, Time Tracking, Production, EOD, or Lender Intelligence.

## Entitlement gating

- `isDiyEntitled(entitlements)` — hides the entire DIY Management module when not enabled.
- The module returns a "not enabled" state instead of rendering.

## Files

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/diy/diy-domain.ts` | ✅ | Domain logic: service types, entitlements, white-label, Person 360, journey steps, import states, issues, truth gate, action plan, evidence, snapshots, conversions |
| `src/lib/diy/diy-management-context.tsx` | 🟡 | Organization (B2B) context with demo data: people, conversions, activity, snapshots, invite/conversion actions |
| `src/components/diy/DiyManagementShell.tsx` | ✅ | B2B shell with nav + entitlement gating (hides module when not entitled) |
| `src/components/diy/management/*` | ✅ | Overview, Consumers, Invitations, Plans, Conversions, Branding, Settings views |
| `src/components/diy/DiyConsumerShell.tsx` | ✅ | Consumer portal shell with white-label branding + view router |
| `src/components/diy/consumer/*` | ✅ | Home, Import, Credit Review, Truth Gate, Action Plan, Dispute Prep, Progress, Issues, Evidence, Documents, Education, Help |

## Routes

| Route | Purpose |
|-------|---------|
| `/app/diy-management` | Organization DIY management (B2B) |
| `/diy-consumer` | Consumer-facing white-label portal (B2C) |
| `/diy-credit` | Marketing product page |

## What requires backend (🔴)

- **Auth & RLS** — Supabase Auth, row-level security, organization isolation
- **Provider integrations** — SmartCredit (Partner Hub keys), IDIQ (CRM integration), MyFreeScoreNow (Client Token), MyScoreIQ
- **PDF OCR / data extraction** — manual PDF upload parsing
- **Billing & payments** — subscriptions, invoicing, commission payouts
- **Storage** — report snapshots, evidence, documents (S3-compatible)
- **Notifications** — email/SMS for invitations, progress, deadlines
- **AI** — report summary, plain-language explanation, draft preparation (grounded, never legal conclusions)
- **Audit** — activity events, conversion records

## Compliance review required (🔴)

- CROA / state credit-services laws for the B2C surface
- Consumer attestation & truth-gate enforcement
- No "guaranteed deletion" / "violation detected" language
- Identity-theft workflow must require explicit consumer confirmation — never inferred
- Funding readiness ≠ funding approval (never implied)
- Privacy: partners only see authorized consumer data, not full DIY accounts
