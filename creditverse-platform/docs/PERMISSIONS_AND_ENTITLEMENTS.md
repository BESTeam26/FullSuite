# BES Permissions & Entitlements

## Entitlements (Organization capability flags)

| Entitlement | Independent? | Required by |
|-------------|--------------|-------------|
| `diyCredit` | Yes | DIY Credit module |
| `creditOps` | Yes | CreditOps module |
| `fundingOps` | Yes | FundingOps module |
| `crm` | Yes (optional) | BES CRM / front-office |

DIY Credit must **not** require CreditOps, FundingOps, Time Tracking,
Production, EOD, or Lender Intelligence.

## Valid DIY setups

- DIY only
- DIY + CreditOps
- DIY + FundingOps
- DIY + CreditOps + FundingOps
- DIY + CreditOps + FundingOps + CRM (Full Suite)

## Module hiding

When `diyCredit` is not entitled, the DIY Management module is **completely
hidden** — it returns a "not enabled" state rather than rendering.

## Privacy / access

Referral attribution does **not** grant the partner access to a consumer's
full DIY account. Partners only see consumer information and progress
specifically authorized for their role/service relationship.

**Sensitive data follows explicit permissions:**
- Credit reports
- Evidence
- Documents
- Disputes
- Internal BES information
- Other clients
- Organization analytics

## DIY consumer portal — never exposed

The consumer portal must **never** expose internal CreditOps data:
- QA
- Processor assignments
- Production
- Time tracking
- Internal notes
- Management comments
- Compliance discussions
- Other clients
- Organization analytics

## Conversion routing

- A consumer acquired through Partner A's tracked link becomes an attributed
  lead for Partner A.
- Partner A can see that consumer inside its authorized workspace.
- Partner B must **never** see Partner A's referrals.
- Direct BES consumers with no partner attribution remain BES-direct leads
  and must not be randomly assigned to a partner.
- Original attribution history is preserved even if the consumer later
  purchases another service.
