# Proposal — QA Scorecards: one engine, a template per department (CreditOps first)

**Status: v2 — Dee's decisions applied (spec Part 3), awaiting Dee's approval
of THIS document before any schema is built.** Dee, 2026-09-19: "review and
analyze so we can make this QA Score card for my agents… that is for CreditOps
alone… Each department and division has their own scorecard." Then: "Before
implementation, update the architecture proposal with these decisions and
show me" the thirteen items in §7 below. The specification and all decisions
are verbatim in `CREDITOPS_QA_SCORECARD_SPEC.md` (Parts 1–3).

Change-control class (§20): **architecture change** — new tables, a new
deterministic engine, a Team Lead workflow, four-view authorization. Planned
here; built when Dee says go.

---

## 1. The spec in one paragraph

A **dispute cycle** (client × round) is the unit of quality. Two departments
work it — Dispute Processing, then Complaints & Mailing — each graded on its
own **versioned checklist** (Pass 100 · Minor 75 · Major 0 · N/A excluded;
section scores × section weights → **QA Workmanship**, capped at 59 by a
confirmed **Critical Error**). The cycle has ONE results record (items
disputed and their statuses) from which **Deletion Rate** and **Positive
Outcome Rate** are derived and shared with every legitimate contributor.
**Final Quality = 0.70 × Workmanship + 0.30 × Deletion Rate.** That Final
Quality is the Quality component of the already-live company model (Quality 35
· Output 35 · Compliance 20 · Attendance 10, `performance_policy`). Per
department the spec also defines Productivity (Target 50 · SLA 30 · Backlog
20) and Compliance (five weighted parts, derived from system facts and QA
findings, never scored twice by hand).

Arithmetic in the spec checks out: 94/40 → 77.8; 95/50 → 81.5; Julius's
overall → 89.725.

## 2. What already exists (verified live, 2026-09-19)

| Spec needs | Exists today | Gap |
|---|---|---|
| Client, partner, round, processor | `fulfillment_clients` — `client_id`, `organization_id` / `outsourcing_group_id` (partner), `round`, `assigned_agent_id`, `status`, `due_at` | No row per **client × round**; the client carries only the *current* round |
| Handoff to Complaints & Mailing | `handoff_client_departments(client, from, targets[], statuses[], note)` → `client_department_statuses`, audited | Carries the **department and status**, not the **required downstream actions** (FTC / BBB / CFPB / bureau upload / mailing) |
| Completed downstream actions | `production_logs` — employee, department, client, `actions[]`, date, `resulting_status` (e.g. Dispute: "CRA Letters Prepared", "Round Processing Completed", "Manual Bureau Upload") | Not tied to a round; Complaints has no action vocabulary in use yet |
| Contributors | Derivable: `production_logs.employee_id` per department per client; `fulfillment_clients.assigned_agent_id` | Not stored as a fact of the cycle |
| Results per round | `client_round_outcomes` — per bureau: `items_disputed, deleted, updated, verified`, `source`, `recorded_by` (manual, from DisputeFox); `RoundOutcomesPanel.tsx` records them. Also the letter-engine's per-item `dispute_item_outcomes` (enum with corrected/updated/unchanged/reappeared/unable_to_compare/result_not_available…) | Both hold **0 rows**. Counts lack Partial Improvement, Pending, Reinserted, Unable to Determine |
| Department work checklists | `creditops_checklist_templates` (per department, `required`, `active`) → `client_work_checklist` per client; `creditops_finalize_checklist` | These are the **doer's** checklist, not a grader's scorecard; no sections, weights, grades or versions |
| A QA verdict | `work_items.qa_result` (pending / passed / needs_fix) + `qa_feedback`, `qa_reviewed_by/at`; `dispute_letters.qa_passed_at/qa_by` | A single verdict per work item — no checklist, no score, no critical error, no template version |
| SLA | `fulfillment_clients.due_at`, `work_items.due_at`, `dispute_timers` (letter engine) | Usable for on-time and backlog once a completion event is defined |
| Targets | `kpi_definitions` (metric catalogue, sources), `organization_kpi_settings` (customer-side targets) | No **per-position** BES target — already D-019 |
| Company weighting | `performance_policy` row; `lib/people/performance-metrics.ts` | Quality component today = passed ÷ reviewed of `work_items.qa_result`; must become Final Quality where a scorecard exists |
| Four views | `managed_people()`, `may_view_workforce_record()`, `team_memberships.is_lead`, `decide_leave_request`'s "lead of their team or management, never yourself" pattern | Apply the same to QA reviews |

**The letter engine (`dispute_rounds`, `dispute_letters`, `dispute_item_outcomes`)
is built and empty.** Live CreditOps runs on `fulfillment_clients` + department
statuses + `production_logs`, with letters produced in DisputeFox. The design
below attaches to what the team actually uses and stays compatible with the
letter engine for when it goes live — it must not fork a second dispute model.

## 3. Design

### 3.1 The dispute cycle is a row: `dispute_rounds`, extended — not a new table

`dispute_rounds (client_id, round_number, strategy, opened_at, closed_at)`
already is "client × round". Extend it rather than adding `dispute_cycles`
(rules 2 and 6):

- `processor_id uuid` (who prepared the round; defaults from
  `fulfillment_clients.assigned_agent_id` when the round opens)
- `items_disputed integer` (typed with the round when letters are in DisputeFox;
  derived from `dispute_letters.item_ids` when the engine is live)
- `required_actions text[]` (FTC / BBB / CFPB / bureau_upload / mailing) — set
  by Processing at handoff; **this is the missing fact** behind the handoff
  checklist items D.3–D.7 and Complaints' D.2–D.7
- `opened_by`, timestamps as today

Opening a round: `creditops_open_round(client, round_number, strategy,
items_disputed)`, called from the existing Complete Work / status flow when a
Dispute-department completion carries "Round Processing Completed". Rounds
open automatically from the work; nobody types one.

### 3.2 Contributors are facts, derived, with a manual override

`dispute_round_contributors (round_id, user_id, department, role
processor|complaints|mailing|upload|bureau_calling|qa_reviewer, source
production_log|handoff|manual, first_at)` — **written by trigger** from
`production_logs` (a Complaints-department production log against the client
while the round is open → contributor) and from the round's opening. Manual add
/ remove by a lead, audited. Attribution rule satisfied: a person shares a
result only when a record shows them working it.

### 3.3 Results: extend `client_round_outcomes`, add the missing statuses

Add `partial_improvement, pending, reinserted, unable_to_determine integer
default 0` beside `deleted, updated, verified`; keep per-bureau rows and the
existing `RoundOutcomesPanel`. Pure functions (`lib/qa/results.ts`):

```
deletionRate      = deleted ÷ items_disputed × 100
resolved          = items_disputed − pending − unable_to_determine
positiveOutcome   = (deleted + updated + partial_improvement) ÷ resolved × 100
```

A bureau row is one bureau's result; the round's figures sum the rows. When
the letter engine goes live, `dispute_item_outcomes` derive the same counts —
one truth, two writers never.

### 3.4 Scorecards are versioned templates — the generic part

```
qa_templates            id, agency_id, key ('creditops_processing'), name,
                        department (fulfillment_department | division key),
                        version, effective_from, active, supersedes_id, created_by
qa_template_sections    template_id, key, label, weight (integer %), sort
qa_template_items       section_id, label, sort, active, guidance
qa_grade_bands          agency_id, scope ('qa' | 'performance'), label, min, max, sort
```

Section weights per template must total 100 (constraint). **Changing a
template creates a new version**; existing reviews keep `template_id`, so
history never moves. Seed v1 of the two CreditOps templates from the spec
(five sections each, 56 + 52 items). Every other department is a template row
plus its items — Dee's "each department and division has their own scorecard"
is the reason the engine is generic and the CreditOps cards are data.

### 3.5 The review — the canonical QA record

```
qa_reviews          id, agency_id, template_id, subject_kind ('dispute_round'|'work_item'),
                    subject_id, reviewee_id, department, reviewer_id,
                    status ('draft'|'completed'), completed_at, feedback,
                    -- what the PERSON may see, separately from what management scores:
                    released_feedback text, released_by, released_at, acknowledged_at,
                    -- frozen at completion (evidence, never recomputed):
                    workmanship_score numeric, deletion_rate numeric,
                    positive_outcome_rate numeric, final_quality numeric,
                    critical boolean, policy_snapshot jsonb
qa_review_items     review_id, item_id, grade ('pass'|'minor'|'major'|'na'), note
qa_critical_errors  review_id, error_type, note, corrective_action, confirmed_by, confirmed_at
```

**Scoring is management-only; feedback is released (Dee, 2026-09-19).** A
completed review is a management record — grades, Workmanship, Final Quality,
critical errors, the reviewer's working notes. None of it reaches the reviewee
by default. The Team Lead *releases* feedback deliberately: `released_feedback`
is the text written for the person ("what to keep doing, what to change on the
next round"), stamped `released_by` / `released_at`; the person acknowledges
it (`acknowledged_at`). RLS gives the reviewee exactly the released columns of
their own reviews and nothing else — never `qa_review_items`, never the frozen
scores, never a draft. The same rule the profile split already applies:
`holds_management_view()` for the intelligence, the released row for the
person (migration 20260919017000).

`work_items.qa_result` stays as the simple verdict for departments without a
scorecard (BES CRM units today) and becomes a **projection** when a scorecard
review completes on a work item: passed when Workmanship ≥ the "Meets
Standard" band and no critical error, else needs_fix. One QA truth; the
verdict is derived from it, never entered beside it.

Engine (`lib/qa/scorecard.ts`, pure, tested against the spec's numbers):

```
itemValue(grade)      pass 100 · minor 75 · major 0 · na → excluded
sectionScore          Σ itemValue ÷ applicable items
workmanship           Σ sectionScore × weight/100, then min(59) if critical
finalQuality          0.70 × workmanship + 0.30 × deletionRate
                      (workmanship alone, flagged "results pending", when the
                       round has no results yet — see decision 1)
grade(score, bands)   from qa_grade_bands; critical → "Critical Failure"
```

The 70/30 split and the 59 cap are **policy data** (`performance_policy` gains
`qa_workmanship_weight`, `qa_results_weight`, `qa_critical_cap`), seeded 70 /
30 / 59 — the same rule as the company weights.

### 3.6 Where the Team Lead does it

On the CreditOps client, per round: **QA this round** opens the template for
the reviewee's department, lists the checklist (Pass / Minor / Major / N/A per
item, note optional), the Critical Error switch (type, note, corrective action
required), the round's results (read, or record if missing), feedback, and
**Complete QA**. The lead types no percentage anywhere; the engine fills the
frozen columns on completion, writes `activity_events`, notifies the reviewee,
and projects the work-item verdict where applicable. The Complaints review
carries an **Upstream Handoff Defect** flag per item: graded N/A for
Complaints and recorded as a finding against the Processing review's section D.

### 3.7 Productivity and Compliance per department — derived, once

| Part | Fact |
|---|---|
| Target Achievement (50) | completed rounds / required actions (from §3.1–3.2) ÷ the position target — **needs D-019 targets**; until then shown as a count and excluded (renormalise) |
| On-Time / SLA (30) | completion date vs `fulfillment_clients.due_at` / handoff SLA |
| Backlog Control (20) | assigned actionable files not overdue, from `fulfillment_clients` (`assigned_agent_id`, `due_at`, active department status) |
| Compliance parts | SOP adherence and documentation from the review's sections C and E (graded once, read twice — the lead never re-scores); workflow/status from the same items plus status facts; reporting/EOD from the live EOD compliance rate; escalation from the escalation items |

`performance-metrics.ts` gains a per-department strategy: where a scorecard
template exists for the person's department, Quality = mean Final Quality of
completed reviews in the period (renormalised when a review has no results),
Output and Compliance from the department formulas; otherwise today's
fallbacks. The company weighting and bands are untouched.

### 3.8 Four views (§20b), by construction

- **Agent**: `qa_reviews_select` where `reviewee_id = auth.uid() and status =
  'completed'` — own completed QA, feedback, results, Quality KPI; never a draft.
- **Team Lead**: creates and completes reviews for people on teams they lead
  (`team_memberships.is_lead` join, the `decide_leave_request` shape); never
  their own; sees team scores.
- **Division Manager**: `may_view_workforce_record` — Processing + Complaints
  quality across their division, not the company.
- **Executive**: rollups by capability.
- Templates: read by all staff; written with `may_set_agency_policy`.
- Probes build the lead and division-manager views in rolled-back
  transactions, as `schedule-scope-probe.mjs` does. No names anywhere.

### 3.9 Sampling and the two timelines (spec Part 2)

Dee's standard: **"Manual QA is sampled. Dispute results are measured across
all eligible resulted work."**

**Eligibility.** A completion becomes QA-eligible when the record says the
agent submitted it: a Processing round completion (`creditops_open_round` /
"Round Processing Completed" production log) or a Complaints & Mailing
completion against a round. `qa_eligible_work` is a view over those facts —
nobody nominates their own file.

**Sampling policy is data.** `qa_sampling_policy` (per agency, editable with
`may_set_agency_policy`):

| Rule | Seeded value |
|---|---|
| baseline per agent per month | 5 — mix 3 random · 1 risk-based · 1 follow-up |
| weekly distribution | 1 · 1 · 1 · 2 |
| new agent window / rate | first 30 days · 3 per week |
| strong performer (Workmanship ≥ 95 for N consecutive months) | 3 per month |
| Workmanship below 90 / below 85 | 3 per week / 5 per week, until back above |
| confirmed critical error | next 5 consecutive submissions |
| new SOP or template version | first 3 applicable files |

**Selection is a job, audited.** A daily cron (`qa_sampling_sweep`, the same
pg_cron + Edge Function pattern as the reward sweep) fills each agent's
remaining quota for the current week from their eligible pool:
`qa_sample_selections (agent, period, week, subject, reason random|risk|
follow_up|new_agent|low_score|critical|sop_change, risk_score, selected_at,
review_id, status pending|reviewed|skipped, skip_reason)`. Random picks use a
stored seed so a selection can be reproduced; risk picks use a deterministic
score (round number, bureaus and furnishers involved, complaint handoff
required, prior QA issue on the client); the follow-up pick is the first
submission after the agent's last review with feedback. The Team Lead's queue
is these rows — not a blank list of files.

**Two timelines, one record.** A review freezes `workmanship_score` at
completion. `deletion_rate` and `final_quality` on the review are NOT the
employee KPI — they are the round's own figures once results exist. The
employee's monthly Quality is computed by the engine as:

```
workmanship        = mean(workmanship_score) over reviews COMPLETED in the period
deletionRate       = Σ deleted ÷ Σ items_disputed over ALL rounds the agent
                     contributed to whose results were RECORDED in the period
positiveOutcome    = the same set, (deleted + updated + partial) ÷ resolved
finalQuality       = 0.70 × workmanship + 0.30 × deletionRate
                     → "Provisional" (workmanship only, flagged) while no
                       resulted rounds exist in the period
```

Shown exactly as Dee wrote it: *Workmanship 93.2% — based on 5 sampled
reviews · Deletion Rate 51.8% — based on 38 resulted rounds / 426 items*.
Complaints & Mailing contributors receive the same round results by the
contributor rule; their monthly rate differs because their contributed set
differs.

**Workload.** Five processors × five reviews ≈ six reviews a week for one
lead; the queue shows the count and the sweep never exceeds the policy.

## 4. Decisions — all taken (spec Part 3)

| # | Decision | Locked as |
|---|---|---|
| 1 | Results window | Workmanship immediate and frozen; Deletion Rate develops; Quality **Provisional** until results; never reopen the review |
| 2 | Contributors | automatic from production activity on client + round + department; manual change only with reason · by · when · history; department membership is never attribution |
| 3 | Where QA opens | `Client → Dispute Round → Department Work → QA Review`; a round holds a Processing QA and a Complaints QA and ONE results record |
| 4 | Bands | six QA grades + Critical Failure for Workmanship / Final Quality, as data; performance bands stay separate |
| 5 | Verdict | Passed = Workmanship ≥ 85 and no confirmed Critical Error; Critical Error caps Workmanship at 59; deletion rate never changes a verdict |
| 6 | Minimums | Quality 85 · Compliance 90 — **flags, not caps**; already live on `performance_policy` (`1996c49`) |
| 7 | Output targets | none invented; framework `Division → Department → Position → Metric → Target → Effective Date`; show counts, SLA, overdue, backlog meanwhile |
| 8 | Scope | CreditOps Dispute Processing + Complaints & Mailing only; other departments are templates later |
| 9 | Reduced sampling | 3 consecutive monthly periods with Workmanship ≥ 95 and no Critical Error |
| 10 | Lifting escalation | by consecutive good submissions, never by calendar (state machine in §7.4) |
| 11 | Complaints "file" | one round's downstream work package; actions graded as items, N/A when not required |
| — | Sampling trigger | Workmanship, Critical Errors, new agents, new SOP versions — never Deletion Rate; low deletion raises a **Results Attention flag** instead |
| — | Double counting | results exist once under the round; rollups aggregate canonical outcomes, never employee-attributed totals |

### What Dee asked for and cannot yet be decided by anyone else

Only the **per-position output targets** (decision 7) and any **future
department templates** (decision 8). Everything else is specified.

## 5. Build order — Dee's, approved

1. Generic versioned QA engine/schema · 2. CreditOps dispute-round canonical
linkage · 3. Seed Dispute Processing QA template · 4. Seed Complaints & Mailing
QA template · 5. QA eligibility + sampling policies · 6. Daily
selection/sampling sweep · 7. Team Lead QA queue and review UI · 8. Agent QA
results/feedback view · 9. Round results + attribution · 10. Provisional →
Final Quality calculation · 11. Performance integration · 12.
Team/Division/Executive rollups · 13. Audit/versioning/history.

Each step ships with its probe; four-view UAT (§7.7–7.10) gates the whole.
Roughly four focused sessions. Other departments' scorecards are not built.

## 6. Risks

- **Two dispute models.** Attaching to `fulfillment_clients` while the letter
  engine sleeps is right for the pilot; the round row (§3.1) is the shared
  spine so the engine can join later without a migration of history.
- **Empty results.** 0 outcome rows today: until leads record DisputeFox
  results, Quality is Workmanship-only and says so. Never invent a deletion
  rate.
- **Double counting.** A QA item feeding both Workmanship and Compliance is
  the spec's intent (score once, read twice) — documented on the card so a
  reviewer is not surprised that one Major hits two numbers.
- **Pilot mode (§21a).** This is a build, not a repair; it starts only when
  Dee says so, one active epic at a time.

---

## 7. The thirteen items Dee asked to see

### 7.1 Canonical tables and relationships

```
fulfillment_clients ──< dispute_rounds (EXISTING, extended)
                             │  client_id, round_number, strategy, opened_at, closed_at,
                             │  + processor_id, items_disputed, required_actions text[],
                             │  + opened_by, results_state (none|partial|complete)
                             ├──< dispute_round_contributors      NEW  user_id, department, role, source, first_at
                             │        └──< dispute_round_contributor_changes  NEW  (add|remove|correct, reason, changed_by, changed_at)
                             ├──< client_round_outcomes            EXISTING, extended  per bureau: items_disputed, deleted, updated,
                             │                                       verified, + partial_improvement, pending, reinserted, unable_to_determine
                             └──< qa_reviews                       NEW  template_id, department, reviewee_id, reviewer_id, status,
                                      │                                 workmanship_score (frozen), critical, feedback, completed_at,
                                      │                                 released_feedback, released_by, released_at, acknowledged_at
                                      ├──< qa_review_items         NEW  item_id, grade pass|minor|major|na, note, upstream_defect bool
                                      └──< qa_critical_errors      NEW  error_type, note, corrective_action, confirmed_by, confirmed_at

qa_templates (division, department, name, version, effective_from, effective_to, active, supersedes_id)
   ├──< qa_template_sections (key, label, weight, sort)
   │        └──< qa_template_items (label, sort, guidance, na_rule, active)
   └──< qa_template_critical_types (label, sort)

qa_grade_bands        (scope 'qa', label, min, max, sort)                 policy data
qa_sampling_policy    (baseline, mix, weekly split, tiers, exit rules)     policy data
qa_sample_selections  (agent_id, department, period, week, round_id, reason, risk_score, seed,
                       selected_at, review_id, status pending|reviewed|skipped, skip_reason)
qa_sampling_state     (agent_id, department, tier, consecutive_good, since, reason, set_by, set_at)
results_attention_flags (agent_id, period, deletion_rate, denominator, reason, acknowledged_by/at)
performance_policy    (EXISTING) + qa_workmanship_weight 70, qa_results_weight 30, qa_critical_cap 59
position_kpi_targets  (division, department, position_id, metric, target, effective_from/to)  — schema only, no rows (decision 7)
```

Relationships point one way: a review belongs to a round and a template; a
contributor belongs to a round; results belong to a round. No table names a
person by anything but `user_id`.

### 7.2 Reuse and migration of what exists

| Existing | Reused as | Migration |
|---|---|---|
| `dispute_rounds` (0 rows) | THE round spine | add columns; `creditops_open_round()` opens a row from the Dispute department's "Round Processing Completed" completion; **backfill**: one row per (client, round) seen in `production_logs` where a Dispute completion exists, `processor_id` = that log's employee, `opened_at` = its date |
| `production_logs` | contributor evidence and eligibility | unchanged; trigger `dispute_round_contributor_from_log()` inserts a contributor when a log's department ∈ {Dispute, Complaints} lands on a client with an open round |
| `handoff_client_departments` | still opens department statuses | gains `p_required_actions text[]` written onto the round; existing callers pass nothing and keep working |
| `client_round_outcomes` (0 rows) + `RoundOutcomesPanel` | THE results writer | add four count columns; the panel gains the four fields; a `results_recorded` trigger sets `dispute_rounds.results_state` and fires recalculation |
| `work_items.qa_result/…` | simple verdict for departments without a scorecard; **projection** of a completed scorecard review when the subject is a work item | unchanged columns; a trigger writes the verdict from the review |
| `creditops_checklist_templates` / `client_work_checklist` | the doer's checklist — untouched | none; a QA item may reference a checklist item for context, never replace it |
| `dispute_letters`, `dispute_item_outcomes` (letter engine, 0 rows) | when live, `items_disputed` and per-item outcomes derive the same counts | none now; a later migration makes `client_round_outcomes` a projection of item outcomes — one writer at a time |

### 7.3 Exact score calculation flow

```
Item grade      pass=100 · minor=75 · major=0 · na=excluded
Section score   Σ item values ÷ applicable items                    (0 applicable → section excluded, weights renormalised)
Workmanship     Σ section score × section weight/100
                if confirmed critical error → min(Workmanship, 59)
Verdict         Workmanship ≥ 85 and no critical → passed; else needs_review; critical → critical_failure
QA grade        from qa_grade_bands (95/90/85/80/70; critical → Critical Failure)
                            ── frozen on the review at Submit; never recomputed ──

Round results   per bureau rows → round totals: items, deleted, updated, partial, verified, pending, reinserted, unable
Deletion rate   deleted ÷ items × 100
Resolved        items − pending − unable
Positive rate   (deleted + updated + partial) ÷ resolved × 100

Employee, per period P (month; quarter = same over three months):
  W(P)  = mean(workmanship_score) over qa_reviews completed in P for this reviewee            [sampled]
  D(P)  = Σ deleted ÷ Σ items over rounds where the person is a contributor AND
          results_state moved to complete within P                                              [all resulted work]
  denominators shown: reviews count; resulted rounds count and items count
  Quality(P) = 0.70·W + 0.30·D            when D exists
             = W, labelled PROVISIONAL     when no resulted rounds in P
             = null                        when neither
  Grade(Quality) from qa_grade_bands

Company performance (existing engine, performance-metrics.ts):
  quality component  = Quality(P)                        (departments with a scorecard)
                     = passed ÷ reviewed of work_items    (departments without one)
  output             = counts only until position_kpi_targets has rows (decision 7)
  compliance         = Processing/Complaints formulas over QA sections C/E + EOD rate + status facts
  overall            = renormalised weighted mean; flags at Quality < 85, Compliance < 90
```

Every step is a pure function in `lib/qa/*.ts`, unit-tested against every
number in the spec (77.8 · 81.5 · 89.725 · 93.2 · 79.49 · 80.8 · 66.67).

### 7.4 QA sampling state machine (per agent × department)

```
                 first 30 days
  NEW ────────────────────────────► STANDARD (5/month: 3 random · 1 risk · 1 follow-up; weeks 1·1·1·2)
   ▲  3/week                          │  ▲                 ▲
   │                                  │  │ 5 consecutive   │ any month W<95 or critical
   │            W < 90 ───────────────┘  │ reviewed ≥90,   │
   │                                  ▼  │ no Major/Crit   │
   │                             MONITOR (3/week) ─────────┼──► REDUCED (3/month)
   │                                  │  ▲                 │    after 3 consecutive monthly
   │            W < 85 ───────────────┘  │ 5 consecutive   │    periods W ≥ 95, no critical
   │                                  ▼  │ reviewed ≥85,   │
   │                             INTENSIVE (5/week)        │  no critical
   │                                                        │
   └── confirmed critical error (from any tier) ──► CRITICAL_WATCH (next 5 consecutive applicable
                                                   submissions) ── all 5 ≥85, no new critical ──► tier by current history
  NEW_SOP: on template version publish, +3 first applicable submissions on top of the current tier
  MANUAL: a lead may raise the tier with a documented reason (e.g. after a Results Attention flag); never lower it
```

Transitions are evaluated by the daily sweep from `qa_reviews` (Workmanship,
Major, critical) and `qa_sampling_state`; every transition is a row with its
reason. Deletion Rate is not an input.

### 7.5 Results attribution rules

1. A contributor is a `(round, user, department, role)` row written from a
   production log on that client, in that department, while the round is open
   — or by a lead with a reason (audited).
2. A round's results are attributed to **every** contributor row on it.
3. Nobody is attributed by department membership, team membership, or by having
   touched the client in another round.
4. A contributor removed (with reason) loses future attribution; past monthly
   figures are recomputed from the corrected contributor set (the change is
   the audit).
5. An **Upstream Handoff Defect** flagged on a Complaints item is recorded as a
   finding against the Processing review's Handoff section of the same round;
   the Complaints item is N/A.

### 7.6 Team Lead workflow

`People & Teams → Performance → QA & Quality → QA Queue` (their team's
pending selections, oldest first, with reason and due week) → **Open review**
→ the round's context (client, round, department work, handoff, links to the
client record and the production log) → grade each item Pass / Minor / Major /
N/A with an optional note; live Workmanship shown → **Critical Error** switch
(type, note, corrective action required) → feedback → **Submit QA**. On
submit: scores frozen, verdict projected, activity event, notification to the
reviewee, selection marked reviewed, sampling state re-evaluated. Results are
recorded separately, when they arrive, on the round (existing panel).

### 7.7 Agent view

**Released feedback only.** The person sees, for their own reviews, what their
Team Lead released: the feedback text, who released it, when, and a place to
acknowledge it. They do **not** see item grades, Workmanship, Deletion Rate,
Final Quality, critical-error records, sampling tier, the queue, drafts, or
anyone else's reviews — denied by RLS and RPC, not by hiding tabs (Dee,
2026-09-19: "The Agent must also be unable to retrieve these management
records through direct URL, RPC/API, or database policy."). Their own
Attendance-style score for Quality stays a management figure until Dee decides
otherwise.

Where it lives: **not** Settings › My Profile, which is identity only, and not
the management Team Member Profile, which redirects the person to Settings.
Released feedback and training belong to an employee-facing development
surface — a future decision, recorded here so it is not re-asked. Until it
exists, releasing feedback notifies the person and the acknowledgment happens
from the notification.

### 7.8 Team Lead view

Queue and reviews for people on teams they lead (`team_memberships.is_lead`);
sampling tier per person with the reason and what lifts it; team W / D /
Quality; Results Attention flags; may raise sampling with a reason; may not
review themselves.

### 7.9 Division Manager view

`may_view_workforce_record` scope: Processing vs Complaints Quality across
their division, QA completion vs quota, deletion and positive-outcome trends
(canonical, §7.13), exceptions, drill-down to team and agent. No write on
reviews unless also a lead of that team; policy read-only.

### 7.10 Executive view

Company rollups by capability: CreditOps Quality and results trends,
department comparison, exceptions, drill-down by scope; templates and policies
editable with `may_set_agency_policy`.

### 7.11 Pending results

`results_state = none` → Quality shows **Provisional** with W only; Deletion
Rate shows **Pending** with the count of unresulted rounds. Pending items inside
a resulted round are excluded from the denominator of the positive rate and
never counted as deletions. A round's results may complete later than the
review; the month in which `results_state` becomes complete is the month the
round enters D(P). Nothing is ever 0 for being unknown.

### 7.12 History and versioning

Reviews store `template_id` (a specific version) and freeze
`workmanship_score`, `critical`, verdict and a `policy_snapshot` (bands, cap)
at submit. Publishing a new template version (`supersedes_id`, `effective_from`)
never touches an existing review. Contributor changes and sampling
transitions are append-only rows. `client_round_outcomes` corrections go
through the existing recorded_by / source columns and re-derive D(P) — the
derived number changes, the evidence does not.

### 7.13 No duplicate attribution, no double counting

- One results record per round (unique `(client_id, round_number, bureau)`);
  contributors are references to it, never copies.
- Employee analytics read results **through** contributor rows; company,
  division, team and partner rollups read `client_round_outcomes` directly —
  a deletion shared by a processor and a complaints agent is one deletion.
- Unique `(round_id, user_id, department)` on contributors; unique
  `(round_id, department, reviewee_id)` on completed reviews; unique
  `(agent_id, round_id)` on selections.
- A probe asserts: Σ employee-attributed deletions ≥ canonical deletions
  (sharing) while every rollup equals the canonical count exactly.

