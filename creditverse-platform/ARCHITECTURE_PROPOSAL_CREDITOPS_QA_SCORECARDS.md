# Proposal — QA Scorecards: one engine, a template per department (CreditOps first)

**Status: analysis and plan, NOT built.** Dee, 2026-09-19: "review and analyze
so we can make this QA Score card for my agents… that is for CreditOps alone,
dispute and complaints scorecard. Each department and division has their own
scorecard." The specification is recorded verbatim in
`CREDITOPS_QA_SCORECARD_SPEC.md`; this file is what it means against the
records that already exist, what has to be added, and what only Dee can decide.

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
                    -- frozen at completion (evidence, never recomputed):
                    workmanship_score numeric, deletion_rate numeric,
                    positive_outcome_rate numeric, final_quality numeric,
                    critical boolean, policy_snapshot jsonb
qa_review_items     review_id, item_id, grade ('pass'|'minor'|'major'|'na'), note
qa_critical_errors  review_id, error_type, note, corrective_action, confirmed_by, confirmed_at
```

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

## 4. What only Dee can decide (before build)

1. ~~Results window~~ — **settled by spec Part 2**: Workmanship from sampled
   reviews completed in the period; Deletion Rate from all resulted rounds in
   the period; Quality "Provisional" until results exist.
2. **Legitimate contributor.** Automatic from a production log on the client
   while the round is open, plus manual add by a lead. Agree?
3. **Where QA opens.** On the CreditOps client's round (proposed) rather than
   on a work item.
4. **QA grade bands vs. performance bands.** Two band sets, both data: the
   spec's six QA grades for Workmanship/Final Quality; the existing four
   performance bands for the overall. Confirm.
5. **The verdict projection**: `passed` at "Meets Standard" (≥ 85) and no
   critical error — or a different line?
6. **Minimum thresholds** for Quality and Compliance (still unset — D-019).
7. **Per-position output targets** (D-019) — without them Output stays a
   count for both departments.
8. **Other departments' scorecards** arrive as templates you write in the same
   shape; nothing in code changes.
9. **"Consistently 95%+"** for reduced sampling — how many consecutive months
   (proposed: 3)?
10. **When a low score lifts** — return to baseline after one full month back
    above the line (proposed), or immediately?
11. **A Complaints & Mailing "file"** — one round's downstream work as a whole
    (proposed), or each complaint / mailing / upload separately?

## 5. Build plan (after Dee's go)

| Phase | Ships | Proof |
|---|---|---|
| 1. Engine + schema | migrations for §3.1–3.5; `lib/qa/*` pure functions; templates v1 seeded from the spec; policy columns | unit tests reproduce every number in the spec; RLS probe, four views |
| 2. Team Lead QA | "QA this round" on the CreditOps client; the sampling policy, eligibility view, daily selection sweep and the lead's QA queue; results statuses; critical errors; completion side effects | live walk-through by a lead on a real round (LIVE VERIFIED gate); sweep probe: quotas, mix, no self-nomination |
| 3. Performance integration | Quality = Final Quality per department; Productivity/Compliance formulas; agent's own QA view | Performance page shows scorecard-derived figures; probe per view |
| 4. Departments | templates for Onboarding, Client Success, Bureau Calling, FundingOps, BES CRM, TalentOps as Dee supplies them | data only |

Effort: phases 1–3 are roughly three to four focused sessions (the sampling
sweep adds most of the fourth); phase 4 is data entry.

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
