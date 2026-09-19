# Architecture proposal — Workforce Compensation Arrangements

**Status: PLAN. Not implemented. Dee, 2026-09-19: "Show me the migration plan
first so we do not corrupt historical payroll or monthly-rate calculations."**

Dee's brief (verbatim intent): Archie's `Rate: ₱100/hour` mixes BES's cost with
the agent's pay. The truth is a *Managing Partner* arrangement — BES pays Bryan
₱100/hour for Archie, Bryan pays Archie ₱80/hour, and the ₱20 is Bryan's
margin, not a BES expense. An agent must only ever see what they earn; a team
lead sees no money at all; finance sees BES cost.

## 1. What the single rate means today (audit, verified live 2026-09-19)

| Where | What it is | What it does with the rate |
|---|---|---|
| `member_pay_rates` (id, agency, user, `rate_type` hourly/per_cutoff/monthly, `rate_cents`, `currency`, `effective_from`, created_by/at) | **The only rate.** Append-only by `effective_from`; history kept | Read as "the rate in force at the cutoff's period end" |
| `payroll_generate_internal(cutoff)` | Builds every payslip for a draft cutoff | Picks ONE rate per person — latest `effective_from <= period_end` — and prices the whole period with it. **No proration across an effective date inside the period.** Freezes `rate_type/rate_cents/currency`, `fx_rate`, `rate_basis` (from `pay_rate_breakdown`) on the payslip |
| `payslips` | One row per person per cutoff; `base_cents`, `adjustment_cents`, `gross_cents` (generated), `payout_cents`, `payout_currency` | The frozen calculation. Regenerating a draft cutoff deletes and rebuilds them |
| `release_payroll(cutoff)` | Books ONE `agency_expenses` row = Σ `payout_cents`, vendor "Payroll", status due | **Treats every payslip's gross as BES's cost.** Correct for Direct BES, wrong for a Managing Partner worker if the payslip holds the agent's pay |
| `pay_rate_breakdown(user, on)` | Derives daily/hourly from the rate + schedule | Feeds `rate_basis` and the Compensation tab's "≈ per day" line |
| `monthly_share_cents` | Monthly package → half per semi-monthly cutoff | Pure arithmetic on `rate_cents` |
| `payroll_recompute_for_entry` | Time entry changes regenerate open draft cutoffs | Re-prices with the same one rate |
| RLS `member_pay_rates_select`, `payslips_select` | `payroll.view` or `payroll.manage` | Money already needs an explicit capability; admin alone does not grant it (kept) |
| TS `people-management.ts` / `use-people.ts` (`usePayRates`, `useSetPayRate`, `usePayRateBreakdown`), `payroll/rate-label.ts` | Data + labels | Single-rate shapes |
| `PayRateEditor` (Compensation tab, payroll.manage), `CompensationTab` | The only rate UI after today's split | Sets `member_pay_rates` |
| `PayrollPanel.tsx` (Finance → Payroll) | Cutoffs, payslips, FX, release | Shows gross per payslip; sums |
| `ExpensesPanel.tsx` | Shows the booked payroll expense | Reads the one expense row |
| Partner billing files (`billing-engine`, `partner-account`, `partner-billing`) | **Unrelated** — partner invoicing rates (`rateCents` name collision only) | Not touched |

Live data: three rates exist (Archie hourly 10000 PHP from 2026-09-19 — which
Dee says is the **BES cost**; Bryan monthly 2 000 000 PHP; Rowell hourly
15000 PHP from 2026-09-09). One cutoff, draft, one payslip. **No released
payroll exists**, so nothing historical needs preserving except the audit
trail of rate changes — the safest possible moment to change the model.

Two things the audit shows the current model cannot express:

1. **Two prices for one hour.** There is one number; Archie's ₱100 is BES's
   cost wearing the agent's label, and a payslip generated today would pay
   Archie ₱100.
2. **A rate change inside a period.** Only the period-end rate is used. Dee
   requires Sep 14–30 at ₱80 and Oct 1 onward at ₱90 to each price their own
   days.

## 2. Target model

### 2.1 `compensation_arrangements` — replaces `member_pay_rates`

```
compensation_arrangements
  id, agency_id, user_id
  arrangement_type      'direct_bes' | 'managing_partner'
  compensation_basis    'hourly' | 'daily' | 'monthly' | 'per_cutoff'   (per_cutoff kept for the existing fixed case)
  agent_rate_cents      what the worker earns per basis unit
  bes_cost_cents        what BES pays per basis unit (= agent_rate_cents when direct_bes; CHECK enforces)
  managing_partner_id   profiles(id), required when managing_partner, null otherwise (CHECK)
  currency
  effective_from date, effective_to date null          (no overlap per user: EXCLUDE constraint on daterange)
  reason text not null, created_by, created_at
```

- **Margin is derived**: `bes_cost_cents - agent_rate_cents`. Never a column,
  never an expense.
- **Effective-dated, append-only.** A change inserts a new row and closes the
  previous one's `effective_to`; an UPDATE that alters a money column on an
  existing row is refused by trigger. Every insert writes `activity_events`
  with previous rate, new rate, arrangement type, effective date, actor,
  reason — the audit list Dee gave.
- Payee follows the type: `direct_bes` → BES pays the worker's
  `member_payout_accounts`; `managing_partner` → BES pays the partner's
  `member_payout_accounts`, and the worker's payment responsibility is the
  partner. No extra column: the type says it.

### 2.2 Payslips become two documents from one time record

`payslips` gains **lines**, not a second hours table:

```
payslips (unchanged identity: cutoff × person)
  work_minutes, paid_leave_minutes, paid_break_minutes   ← canonical approved time, once
  agent_gross_cents      Σ over segments: minutes × agent_rate         (the Agent Payment Statement)
  bes_cost_cents         Σ over segments: minutes × bes_cost           (what BES books)
  arrangement_type, managing_partner_id                  frozen from the arrangement(s) in force
  segments jsonb         [{from, to, minutes, agent_rate_cents, bes_cost_cents, arrangement_id}]  frozen proration
```

- `payroll_generate_internal` splits the period by arrangement boundaries and
  prices each segment with its own rates — the proration Dee requires. Monthly
  basis prorates `monthly_share_cents` by calendar days in each segment.
- `adjustment_cents` stays on the **agent** side (a bonus to Archie) unless a
  new `bes_adjustment_cents` is explicitly used; default: adjustments follow
  the agent statement and BES cost moves by the same amount for a direct
  worker, and by the same amount for a managing-partner worker (BES pays the
  partner the extra so the partner can pay it on) — to confirm with Dee.

### 2.3 Managing Partner Settlement

A view (not a table) per cutoff × partner:

```
managing_partner_settlements (view)
  cutoff_id, managing_partner_id,
  Σ bes_cost_cents  → BES payable to partner
  Σ agent_gross_cents → partner's obligation to their workers
  Σ margin
  drilldown: the payslips rows themselves
```

`release_payroll` books **Σ bes_cost_cents** as the one payroll expense (not
Σ agent gross, not cost + margin). The Agent Payment Statement is the payslip
filtered to agent columns; the Settlement is the view.

### 2.4 Capabilities (existing convention `area.object.verb`)

```
payroll.view                 existing — payslips, cutoffs (BES-side figures)
payroll.manage               existing — generate, release, adjust
compensation.agent_rate.view  see a worker's own rate on the management profile
compensation.bes_cost.view    see BES cost and partner margin
compensation.arrangement.manage  create arrangements
```

Registered as rows in the capability registry, granted to Dee, Aaron and
Bryan **by grant, not by name** (the same `agency_member_permissions` path
Bryan's payroll grant already uses). `admin` alone still grants none of them.
`ops.manage`, team lead, division manager: nothing.

Own statement for the worker: a later `my_payment_statements` definer
function returning agent columns of the caller's own released payslips — the
only money an agent ever reads, and nothing on it can reveal `bes_cost_cents`.

### 2.5 RLS

| Object | Read | Write |
|---|---|---|
| `compensation_arrangements` | `compensation.agent_rate.view` (agent columns) — `bes_cost_cents` and `managing_partner_id` through a view that requires `compensation.bes_cost.view` | `compensation.arrangement.manage` via one RPC `set_compensation_arrangement(...)` with a required reason |
| `payslips` | `payroll.view`/`manage` (as today) — agent columns also to the row's own user **only once released** via the definer function | payroll functions only |
| settlement view | `payroll.view` + `compensation.bes_cost.view` | — |

## 3. Migration plan (order matters; each step is reversible until step 6)

1. **Registry + grants.** Add the three capability keys; grant to Dee, Aaron,
   Bryan through `agency_member_permissions`. Nothing changes behaviour yet.
2. **Create `compensation_arrangements`** with constraints, triggers (no
   overwrite; audit), RPC, RLS. Empty.
3. **Backfill from `member_pay_rates`** as `direct_bes` with
   `bes_cost = agent_rate` (the only honest default: today's number is the
   only number we have), preserving `effective_from` history. Then **Dee
   corrects Archie by hand** through the new RPC: managing partner Bryan,
   agent ₱80, BES cost ₱100, effective 2026-09-14, reason. The backfill row
   for Archie is closed on 2026-09-13.
4. **Payslips gain the new columns** (`agent_gross_cents`, `bes_cost_cents`,
   `arrangement_type`, `managing_partner_id`, `segments`), nullable, then
   `payroll_generate_internal` is rewritten to price by segments from
   `compensation_arrangements`. The existing one draft payslip is
   regenerated (it is a draft; regeneration is its normal life).
   `base_cents`/`gross_cents` remain as the **agent** figures for
   compatibility — `gross_cents` is what today's UI shows and it must be the
   agent's number, never BES's.
5. **`release_payroll` books Σ `bes_cost_cents`.** The settlement view is
   created. `PayrollPanel` shows both figures to payroll users; the
   settlement gets its own section under Finance → Payroll.
6. **Retire `member_pay_rates`**: `pay_rate_breakdown` reads the arrangement
   (agent rate for the profile card, BES cost for finance); `useSetPayRate`
   is removed; `PayRateEditor` becomes the arrangement editor rendered only
   for `compensation.arrangement.manage`; the Compensation tab renders
   nothing at all — not a masked value — without `compensation.agent_rate.view`.
   The table is dropped only after one released cutoff proves the new path.

Nothing above rewrites a released payslip: there are none, and after this the
frozen segments make one impossible to restate.

## 4. What is NOT decided and needs Dee

1. Adjustments on a managing-partner worker (§2.2): follow the agent statement
   and raise BES cost equally, or become a BES-side-only line?
2. Aaron is not in the platform's people list; the grant needs his account.
3. Does the partner (Bryan) see his own settlement inside FullSuite (a
   `compensation.settlement.view` for the partner's own rows), or only
   finance?
4. Daily basis: prorate a monthly package by paid schedule days or calendar
   days? (Today's `pay_rate_breakdown` uses 261 paid days a year; the
   monthly share uses calendar halves.)

## 5. Done already (today, before the build)

- "Schedules & rates" is **"Schedule"** on the Time & Attendance tab; no rate,
  no derived daily figure. A team lead sees when Archie works and nothing
  about money.
- The rate editor moved into the Compensation tab behind `payroll.manage`.
- `member_payout_accounts` exists (where money is sent) — the arrangement
  decides *whose* account payroll pays.
