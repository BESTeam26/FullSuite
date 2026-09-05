# Pricing & billing model — analysis and plan (2026-09-04)

**Status: analysis for Dee's review. The plan rows in `plans` (migration 0049)
carry Dee's proposed numbers as editable data; nothing sells, bills or enforces
limits yet.** Goal: competitive lane — not cheap, not expensive.

## 1. Verified competitor facts (fetched 2026-09-04)

**Credit Repair Cloud** (creditrepaircloud.com/pricing)

| Plan | Monthly | Active clients | Users | Extra user | Extra 100 clients |
|---|---:|---:|---:|---:|---:|
| Personal | $49 | 3 (friends/family) | 1 | $50 | $50 |
| Start | $179 | 300 | 3 | $50 | $50 |
| Grow ★ | $299 | 600 | 6 | $40 | $40 |
| Scale | $399 | 1,200 | 12 | $30 | $30 |
| Enterprise | $599 | 2,400 | 24 | $20 | $20 |

Annual: 20% off (Start $143.20/mo … Enterprise $479.20/mo). Start and above
include automations, client billing, email automation, private-label portal.

**HighLevel** (gohighlevel.com/pricing): Starter $97 (3 sub-accounts),
Unlimited $297 (unlimited sub-accounts, rebill phone/email at cost), Agency Pro
$497 (SaaS mode, automated sub-account creation, rebill **with markup**).
Annual = 10 × monthly. Usage (help.gohighlevel.com pricing guide): email
$0.675 per 1,000; email validation $2.50 per 1,000; phone/SMS at Twilio rates;
AI Employee pay-per-use or $50 / $97 per location; WhatsApp $10/mo per
sub-account + usage; premium workflow actions $0.01 per execution; agency
wallet auto-refills; markup rebilling only on Agency Pro.

**DisputeBee**: pricing page is script-rendered and could not be read by the
fetcher. Dee's figure ($129/month, unlimited clients and team members) is
**unverified** here and marked as such until confirmed by hand.

## 2. Dee's proposed ladder against the lane

| BES | Price | Records | Seats | CRC comparable | Read |
|---|---:|---:|---|---|---|
| Empire Build | $149 | 250 | owner + 5 | Start $179 / 300 / 3 | $30 under, 50 fewer records, **3 more seats + the whole operating engine** — clearly competitive, not cheap-looking |
| Empire Grow ★ | $249 | 750 | owner + 10 | Grow $299 / 600 / 6 | $50 under with more records, more seats, both verticals — the obvious "most popular" |
| Empire Scale | $399 | 2,500 | owner + 25 | Scale $399 / 1,200 / 12 | same price, double the records and seats, **plus CRM** — strong |
| Enterprise | $599+ | 5,000 | owner + 50 | Enterprise $599 / 2,400 / 24 | same price, double capacity; expansion $75/1,000 records, $50/10 seats vs CRC $20 per user / $20 per 100 clients |

Observations:
- **Seat add-on parity.** CRC sells single users ($20–$50). BES sells blocks of
  10 for $50 = $5/seat — far cheaper per seat. Fine as a strategy (workforce
  growth should not be taxed), but a small Build customer wanting one extra
  seat pays for ten. Consider a **+1 seat at $10** option below the block, or
  keep the block and say why (BES seats are for operations staff).
- **Records add-on only on Enterprise.** A Grow customer at 751 records is
  forced to Scale (+$150). CRC sells +100 clients at $40 on Grow. Either allow
  the 1,000-record block ($75) on Scale too, or add a **+250 records at $35**
  step for Grow. Otherwise the jump is a churn risk at exactly the moment the
  customer is succeeding.
- **Annual = 10 × monthly** (two months free) is easier to sell than CRC's 20%
  and matches HighLevel's own presentation. Keep.
- **CRM cost floor.** BES CRM at $99 and the +$75 add-on ride on a HighLevel
  Agency Pro plan ($497/mo) because SaaS mode + markup rebilling need it.
  Sub-accounts are unlimited, so the marginal cost is usage only; the
  fixed $497 is covered after ~5 CRM customers. Usage (SMS/email/AI/WhatsApp)
  must be rebilled with markup — the "usage billed separately" line is
  load-bearing, not fine print.
- **Trial = Empire Grow for everyone** is implemented (migration 0049): CRM
  is never provisioned on a trial; Enterprise is by agreement. A **CRM-only
  buyer** currently trials the operating platform without the CRM they came
  for — acceptable only if the sign-up copy says so, or BES CRM gets its own
  controlled trial path (recommended: manual provisioning after a call).
- **Enterprise "$599+"**: same platform, more capacity, priority support and
  onboarding — keep the language tight (onboarding ≠ custom development).

## 3. What "not included" must always say
AI credits (see `ARCHITECTURE_PROPOSAL_AI_CREDITS.md`), SMS/telephony, metered
email, credit-monitoring / bureau-data costs, mailing/postage, premium
third-party services, other consumption-based integrations, BES fulfilment
labor (CreditOps / FundingOps / TalentOps — separate agreements; BES personnel
never consume customer seats).

## 4. Seat and active-record definitions (now deterministic code)
- `organization_seat_usage(org)` — active organization users, excluding the
  Organization Owner (`organizations.owner_user_id`, set by sign-up), BES
  personnel (any agency membership), and client/consumer portal users (not
  organization members). GHL-only users are not platform users.
- `organization_active_records(org)` — CreditOps clients not in Completed /
  Archived / Graduated + FundingOps clients not in Funded / Declined /
  Withdrawn / Archived. History, documents, activity, production never count.
Both are measurements for the plan-usage display; enforcement (soft limits,
upgrade prompts) is a later step once billing exists.

## 5. Plan before anything customer-facing
1. Dee confirms or adjusts: seat step below the 10-block; a records step for
   Grow/Scale; whether CRM-only gets its own trial path.
2. Then: PlanPicker shows prices/capacities/recommended; Build shows the
   CreditOps-or-FundingOps choice; organization Settings shows Plan & usage.
3. Then billing: Authorize.Net (credentials in server secrets), conversion
   applies the chosen plan's products and the Build choice; usage prompts.
