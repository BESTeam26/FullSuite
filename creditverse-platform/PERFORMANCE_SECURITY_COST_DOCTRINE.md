# FULLSUITE PERFORMANCE, SECURITY & COST CONTROL DOCTRINE

> Supplied by Dee, 2026-09-21, verbatim. This file is the source of record.
> CLAUDE.md rule 22 points here; do not paraphrase this document elsewhere.

FullSuite is BES's production operating system.
Current expected operating scale:

* approximately 20 internal users
* approximately 25–30 Partner companies
* primary use 9 AM–6 PM weekdays
* CreditOps is the highest-volume workspace
* multi-tenant RLS
* realtime messaging
* time tracking
* attendance
* QA/performance
* payroll
* billing
* portals
* automations
* background jobs
* AI features

We want to remain on the lowest Supabase compute tier that comfortably supports production.
Do NOT solve performance problems by immediately increasing compute.
Optimize the architecture first.
Priority order:
1. Security
2. Correctness / data integrity
3. Operational reliability
4. User-perceived speed
5. Infrastructure efficiency / cost
Do not sacrifice a higher priority to improve a lower priority.

## 1. NO BLIND COMPUTE UPGRADES

Never recommend or implement a Supabase compute upgrade merely because:

* the app has many features
* a query feels slow once
* a build has become larger
* more tables were added
* more functions were added

Before recommending more compute, identify measurable evidence such as:

* sustained CPU pressure
* sustained memory pressure
* connection exhaustion
* disk I/O bottleneck
* consistently slow queries after indexing/query optimization
* background-job contention

First investigate:

* missing/incorrect indexes
* unnecessary table scans
* inefficient RLS
* N+1 queries
* duplicated requests
* oversized payloads
* unnecessary realtime subscriptions
* excessive polling
* inefficient cron jobs
* unbounded queries
* expensive count/aggregate queries
* duplicate data derivations

Compute scaling is the last optimization step, not the first.

## 2. QUERY BUDGET

Every production query must be:

* tenant scoped
* bounded
* indexable where practical
* paginated when result size can grow
* limited to required columns

Avoid:
`select *`
unless the complete row is genuinely required.
Avoid returning thousands of rows to the browser and filtering there.
Do filtering, authorization and pagination at the database/query layer.
For growing datasets, require:
`LIMIT / pagination / cursor`
or another explicit bound.

## 3. RLS PERFORMANCE IS PART OF SECURITY

Do NOT weaken RLS to improve performance.
Optimize the authorization path instead.
For every RLS helper/policy:

* avoid repeated expensive subqueries
* use indexed foreign keys
* reuse canonical scope helpers
* avoid unnecessary nested policy recursion
* verify tenant filters use indexed columns
* avoid evaluating the same scope multiple times per row where a safe canonical helper/projection can be used

Authorization must remain enforced in the database.
Hiding UI is not security.

## 4. MULTI-TENANT INDEXING

Every major growing operational table must be reviewed for indexes based on actual access patterns.
Common filters likely include:

* organization_id
* partner_id
* client_id
* work_item_id
* division_id
* department_id
* team_id
* assignee_id
* status
* created_at
* due_at
* pay_period
* invoice status

Use compound indexes when actual query patterns justify them.
Do NOT create indexes indiscriminately.
Every index increases write/storage overhead.
Add indexes because a real query needs them.

## 5. NO N+1 FETCHING

A page listing 50 clients must not perform:
`1 list query + 50 additional detail queries`
unless there is a compelling reason.
Prefer:

* proper joins
* efficient projections
* RPC where justified
* batched fetches

Monitor request counts as part of frontend performance.

## 6. SHARED DATA = SHARED QUERY

If multiple components/pages require the same canonical dataset:
reuse one query/cache where appropriate.
Do not independently fetch the same Partners, Teams, capabilities, profile, unread count, or service list multiple times during one navigation flow.
Avoid second truths and duplicate network cost.

## 7. CACHE CAREFULLY

Cache data that is safe to cache:

* configuration
* relatively stable reference data
* positions
* structure
* module definitions
* policy definitions

Be conservative with:

* authorization
* financial state
* queues
* payments
* payroll
* attendance
* realtime conversations

Never let stale caching bypass permission changes or display incorrect financial state.
Correctness beats cache hit rate.

## 8. REALTIME MUST BE SCOPED

Do not subscribe every user to organization-wide realtime events.
Scope realtime subscriptions to records the effective user legitimately needs.
Examples:
Agent:
their conversations / work / notifications.
Team Lead:
relevant team scope.
Division Manager:
division scope where realtime is genuinely needed.
Executive:
do not automatically subscribe to every event merely because they may view it.
Use realtime where immediate updates materially improve operations.
Do not use realtime as a substitute for good querying.

## 9. NO HIGH-FREQUENCY POLLING

Do not poll the database every few seconds for:

* messages
* notifications
* queue state
* attendance
* invoice state

if realtime/event-driven architecture already exists.
If polling is required:

* justify it
* use the slowest interval compatible with the business requirement
* pause it when the page/tab is inactive where appropriate

## 10. BACKGROUND JOBS MUST BE EVENT-DRIVEN WHERE POSSIBLE

Prefer:
`business event → queued work`
rather than:
`cron repeatedly scans every row looking for changes`
Cron is appropriate for:

* due-date sweeps
* daily/quarterly evaluation
* recovery jobs
* scheduled summaries

But every cron job must:

* query only eligible rows
* use indexed predicates
* process bounded batches
* be idempotent
* avoid reprocessing completed rows
* record failures for retry

No endless full-table sweep every minute.

## 11. BATCH LARGE JOBS

Anything that can eventually affect thousands of records must process in batches.
Examples:

* billing sweeps
* QA sampling
* birthday rewards
* attendance quarter close
* bulk notifications
* Partner lifecycle updates

One bad record must not abort the entire batch.

## 12. EDGE FUNCTIONS

Edge Functions should be thin orchestration layers where possible.
Avoid:

* repeatedly loading huge datasets
* doing work Postgres can efficiently do itself
* serial API calls that can safely be batched
* unnecessary function invocations from render cycles

Ensure:

* authentication
* authorization
* idempotency
* bounded work
* structured failure logging

## 13. AI COST CONTROL

AI functionality must have its own cost discipline.
Do NOT call AI automatically when deterministic logic can answer the request.
Use AI for:

* summarization
* analysis
* generation
* classification requiring language reasoning

Do not use AI for:

* arithmetic
* status lookup
* permissions
* simple routing
* deterministic workflow decisions

AI requests must:

* send only necessary context
* avoid dumping entire Partner/client histories when a smaller relevant context works
* avoid duplicate generation
* reuse stored results when appropriate
* have sensible token/output limits

Any high-volume automated AI feature requires a cost estimate before activation.

## 14. AI MUST NEVER BECOME AUTHORIZATION

AI may suggest.
AI does not decide:

* access
* payroll
* billing
* financial approval
* disciplinary actions
* compliance authorization

Those remain deterministic and auditable.

## 15. FILE / STORAGE CONTROL

Do not store duplicates unnecessarily.
For uploads:

* one canonical object
* metadata/reference rows as needed

Avoid copying the same PDF/image into separate buckets for each surface.
Apply sensible file-size limits.
Generate thumbnails/previews only when needed.

## 16. FRONTEND PERFORMANCE

Avoid turning FullSuite into a giant initial bundle.
Use:

* route/module lazy loading where appropriate
* pagination
* virtualized lists where datasets warrant it
* deferred heavy panels
* skeleton/loading states

Do not block the entire page because one secondary card is loading.
Core interaction should become usable first.

## 17. DASHBOARD RULE

Dashboards must not execute dozens of independent expensive aggregates on every load.
For expensive rollups, prefer:

* canonical aggregate functions
* efficient views
* precomputed snapshots/materialization only when justified

Never duplicate the same calculation separately across five cards.

## 18. PERFORMANCE TARGETS

Use these as engineering targets, not reasons to weaken correctness:
Normal page navigation
target perceived load: < 2 seconds
Typical API/database interaction
target p95: < 500 ms where practical
Simple mutations
target: < 1 second
Search/filter interactions
target: responsive enough for normal operational use, generally < 500 ms after input stabilization
Heavy reports may take longer but must show progress/loading state.
Do not fake speed by returning incomplete or stale financial/security-sensitive information.

## 19. PERFORMANCE GATE FOR NEW FEATURES

Every substantial feature must answer:

1. How many database requests occur on initial load?
2. Are any requests duplicated?
3. Are queries bounded?
4. Are the main filters indexed?
5. Does RLS remain correct?
6. Is realtime necessary?
7. Is polling being introduced?
8. Does a background job scan more rows than necessary?
9. Could this materially increase Edge Function usage?
10. Could this materially increase AI usage?
11. Could this materially increase storage/egress?
12. Does this create another source of truth?

If yes to a material cost increase, report it before deployment.

## 20. COST IMPACT MUST BE REPORTED

For changes likely to materially affect infrastructure usage, include in the completion report:

```
COST IMPACT

Database compute: Low / Medium / High
Database storage: Low / Medium / High
Egress: Low / Medium / High
Realtime: Low / Medium / High
Edge Functions: Low / Medium / High
AI/API spend: Low / Medium / High

Reason:
...
```

Do not pretend to know an exact dollar figure without measured usage.

## 21. PRODUCTION METRICS

Maintain visibility into:

*  CPU
*  RAM
*  connection utilization
*  database size
*  slow queries
*  query frequency
*  function invocations
*  realtime messages
*  realtime peak connections
*  storage
*  egress
*  AI usage/cost

Review trends, not single spikes.

## 22. COST ALERTS

Configure provider spending/usage alerts wherever Supabase or the applicable provider supports them.
Suggested operational thresholds:

*  50% of expected monthly usage: informational
*  75%: review
*  90%: investigate immediately

Never rely solely on the invoice at month end.

## 23. NO UNNECESSARY INFRASTRUCTURE

Do not create:

*  another Supabase project
*  another database
*  another storage system
*  another queue system
*  another realtime service

unless the existing architecture genuinely cannot safely satisfy the requirement.
Every additional infrastructure component adds recurring cost and operational complexity.
FullSuite should remain one coherent platform.

## 24. SECURITY CANNOT BE TRADED FOR COST

Never propose:

*  disabling RLS
*  broader service-role usage
*  sharing credentials
*  weakening audit logs
*  removing encryption/security controls
*  broadening capabilities

merely to reduce queries or infrastructure usage.
Security is non-negotiable.

## 25. FINANCIAL DATA GETS STRONGER RULES

Payroll, compensation, Partner margins, invoices, payments and Finance must prioritize:
correctness + authorization + auditability
over caching or convenience.
Never cache or derive financial values in ways that can become a competing source of truth.

## 26. MEASURE BEFORE OPTIMIZING

Do not perform speculative rewrites solely because something might someday be slow.
Build correctly.
Measure.
Find the actual bottleneck.
Optimize the bottleneck.
Measure again.

## 27. BEFORE RECOMMENDING MEDIUM COMPUTE

If FullSuite currently runs on Small, do not recommend Medium until you provide:

*  current CPU utilization
*  memory utilization
*  connection utilization
*  top slow queries
*  workload causing pressure
*  optimizations already attempted
*  before/after measurements

Then explain why additional compute is still justified.

## 28. STANDING RELEASE REQUIREMENT

A feature is not complete merely because:

*  tests pass
*  TypeScript builds
*  the UI renders

It must also be reviewed for:
Security
Data correctness
Scope
Performance
Infrastructure/cost impact
All four user views
Agent
Team Lead
Division Manager
Executive

## OPERATING PRINCIPLE

Spend engineering before spending infrastructure.
But do not spend hours saving pennies if doing so makes FullSuite brittle or difficult to maintain.
We want:
efficient architecture + simple operations + strong security + fast UX + predictable cost.
Not:
the absolute cheapest possible architecture.

I would add one more explicit instruction for Claude because of how fast FullSuite has been growing:
Do not optimize only for today's 20 users. Design queries so 10× the current dataset does not require a rewrite. But do not provision infrastructure for 10× users before they exist.
That's the balance you're looking for.

For your actual BES environment, I would establish a simple operating budget:
Supabase target: stay on Small as long as real measurements support it.
Normal Supabase baseline: around the current Pro + Small level.
AI: separate monthly budget/usage tracking because AI is more likely than Supabase compute to become your variable cost as FullSuite becomes more automated.
Messaging/SMS: track separately as well. If you start sending large volumes through GHL/Twilio or another provider, messaging can become a much larger operating cost than your database.

And I would make Claude report one very useful thing after every major feature from now on:
"Does this change increase recurring infrastructure cost?"
No material increase, or
Yes, because...

That one sentence will force it to think about cost before quietly adding another cron job, realtime subscription, AI call, or expensive database query.
The key principle for FullSuite should be: don't make the app cheaper by making your team wait. Make the software efficient enough that your current compute stays cheap while the team doesn't notice the constraint.
