# BES Product Architecture

> **BES — The Connected Platform.** Start with what you need. Connect more as you grow.

## Hierarchy

```
                         BES
                The Connected Platform
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   CreditOps        FundingOps       DIY Credit
        │                │                │
        └────────────────┼────────────────┘
                         │
                      BES CRM
                 Front-Office Layer
                         │
                    FULL SUITE
              Everything Connected
```

**Full Suite is a plan, not a fifth application.** A Full Suite customer gets
the BES platform with the relevant modules activated — one workspace, one
client, one team, one activity stream.

## Modules

| Module | Position | Standalone |
|--------|----------|------------|
| BES CreditOps | Credit repair fulfillment & operations | Yes |
| BES FundingOps | Business funding operations | Yes |
| BES DIY Credit | White-label consumer credit platform | Yes |
| BES CRM | Front-office CRM & automation | Optional (connect-or-replace) |
| BES Full Suite | The connected plan | Extends workspace |

## Shared foundation

All modules share one credit-intelligence foundation:
- Canonical credit data
- Evidence
- Policy
- Audit
- Client 360

## Status markers

- ✅ Frontend Complete
- 🟡 Demo Only
- 🔴 Backend Required
- 🔴 Provider Integration Required
- 🔴 Billing Required
- 🔴 Compliance Review Required

## See also

- [DIY Credit Architecture](./DIY_CREDIT_ARCHITECTURE.md)
- [Client Journeys](./CLIENT_JOURNEYS.md)
- [Permissions & Entitlements](./PERMISSIONS_AND_ENTITLEMENTS.md)
