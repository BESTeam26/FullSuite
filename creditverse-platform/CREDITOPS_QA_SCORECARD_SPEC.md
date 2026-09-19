# CreditOps QA Scorecards — Dee's specification (verbatim)

Supplied by Dee in chat on 2026-09-19, recorded here unchanged before any
analysis or build (standing rule: documents Dee hands over go into the
repository first). The analysis is in
`ARCHITECTURE_PROPOSAL_CREDITOPS_QA_SCORECARDS.md`.

---

Absolutely. Here's a Claude-ready specification you can use as the source of truth for both departments.
I'd lock the employee-level Quality KPI for both departments as:
Final Quality Score = 70% QA Workmanship + 30% Deletion Rate
This gives deletion/results real weight, as you want, while still keeping most of the score tied to work the team directly controls.
Then the employee's overall BES performance still uses:
Quality 35% + Productivity/Output 35% + Compliance 20% + Attendance 10%
Below is the full scorecard.

CLAUDE INSTRUCTION: CREDITOPS QA SCORECARDS
Build structured QA scorecards for:

1. Dispute Processing
2. Complaints & Mailing

These two departments are connected parts of the same Credit Repair dispute cycle.
A dispute round is not considered operationally complete just because dispute letters were created.
The full cycle is:
`Credit Report Review`
→ `Dispute Preparation`
→ `CRM / CreditOps Documentation`
→ `Handoff`
→ `Complaints / Mailing / Bureau Actions`
→ `Results`
One canonical dispute cycle must know:

* client
* Partner
* round
* processor
* complaints/mailing contributor(s)
* QA reviewer
* items disputed
* required downstream actions
* completed downstream actions
* results

Do not duplicate the dispute result for each employee.
Results belong to the dispute cycle and are attributed to all legitimate contributors.

UNIVERSAL QA GRADING
Every QA checklist item uses:
Pass = 100%
Minor Issue = 75%
Major Issue = 0%
N/A = excluded from denominator
Each section score is:
`sum(item earned values) ÷ applicable items`
Then:
`QA Workmanship Score = Σ(section score × section weight)`

CRITICAL ERRORS
Each QA review also supports:
Critical Error = Yes / No
Critical examples:

* wrong client
* wrong bureau
* materially incorrect account data
* wrong round
* dispute action on wrong file
* required handoff completely omitted
* required complaint/mail/upload action completely omitted
* wrong documents submitted
* file moved to a stage that incorrectly triggers client automation
* file marked complete while required downstream work was incomplete
* serious compliance/privacy issue

If one or more confirmed Critical Errors exist:
`QA Workmanship Score is capped at 59%`
Require:

* critical error type
* reviewer note
* corrective action

Critical errors must be auditable.

DELETION RATE
For each round:
`Deletion Rate = Deleted Items ÷ Total Items Disputed × 100`
Example:
18 items disputed
7 deleted
`Deletion Rate = 38.89%`
Also calculate:
`Positive Outcome Rate = (Deleted + Corrected/Updated + Partial Improvement) ÷ Resolved Items × 100`
where:
`Resolved Items = Total Items Disputed - Pending/Unable to Determine`
Keep Deletion Rate and Positive Outcome Rate separately.
Deletion Rate is the score used in the Quality calculation.
Positive Outcome Rate is a supporting operational metric.

FINAL QUALITY SCORE
For both Dispute Processing and Complaints & Mailing:
70% QA Workmanship
30% Deletion Rate
Formula:
`Final Quality Score = (QA Workmanship × 0.70) + (Deletion Rate × 0.30)`
Example:
QA = 94%
Deletion Rate = 40%
`(94 × .70) + (40 × .30)`
`65.8 + 12`
Final Quality = 77.8%
Show Positive Outcome Rate separately.

RESULT STATUS OPTIONS
Each disputed item may be:

* Deleted
* Corrected / Updated
* Partial Improvement
* Verified / Remains
* Pending
* Reinserted
* Unable to Determine

Do not count Pending or Unable to Determine as deleted.

1. DISPUTE PROCESSING QA SCORECARD
QA Workmanship = 100% before the 70/30 outcome blend.
Section weights:
A. Credit Report Review & Dispute Accuracy — 25%
Checklist:

1. Correct client credit report reviewed
2. All three applicable bureaus reviewed
3. Previous round results reviewed
4. Remaining negative items correctly identified
5. Deleted items not unnecessarily redisputed
6. New/changed reporting identified
7. Correct accounts/items selected for dispute
8. No eligible item materially missed
9. No incorrect/non-applicable item disputed
10. Correct dispute reason/basis selected
11. Correct round strategy used
12. Furnisher/lender action identified when required

Section score:
`earned ÷ applicable × 25`
B. Dispute Letter Preparation — 20%
Checklist:

1. Correct CRA letters created
2. Correct bureau mapped to each letter
3. Correct client identifying information
4. Correct accounts/items included
5. Correct dispute reason/basis used
6. Correct requested action
7. Furnisher/lender letters created when required
8. Correct creditor/furnisher information
9. Supporting evidence referenced/attached where required
10. No contradictory or materially incorrect information

Section weight: 20%
C. Round Documentation & System Updates — 20%
Checklist:

1. Correct round number recorded
2. DisputeFox / Credit Repair CRM updated
3. CreditOps tracker updated
4. Correct CreditOps status selected
5. Correct GHL pipeline/stage selected
6. Pipeline movement supports the intended automation
7. Required internal notes completed
8. Date sent / processed recorded
9. Expected next review/reimport date recorded when applicable
10. Required supporting documents uploaded
11. Result/history from prior round preserved
12. Client's current operational status accurately reflected

Section weight: 20%
D. Handoff to Complaints & Mailing — 20%
Checklist:

1. Handoff created when downstream work is required
2. Correct downstream department identified
3. Required FTC action identified correctly
4. Required BBB action identified correctly
5. Required CFPB action identified correctly
6. Required CRA/bureau upload identified correctly
7. Mailing requirement identified correctly
8. Required documents/evidence attached
9. Clear instructions/context provided
10. Correct client/account/bureau information handed off
11. Handoff completed within required SLA
12. No downstream research/rework caused by incomplete handoff

Section weight: 20%
If required handoff is completely omitted:
mark Major Issue
and evaluate whether it qualifies as a Critical Error.
E. SOP & Workflow Compliance — 15%
Checklist:

1. Current SOP version followed
2. Correct workflow sequence followed
3. Required cooling-off/timing rules followed
4. Required checklist completed
5. No unauthorized shortcut
6. Correct escalation path used
7. Required reporting completed
8. Duplicate/unnecessary dispute avoided
9. File not prematurely marked complete
10. Required documentation standards met

Section weight: 15%
DISPUTE PROCESSING QA FORMULA
`QA Processing Score =`
`(Review Accuracy × .25)`
`+ (Letter Preparation × .20)`
`+ (Documentation/System Updates × .20)`
`+ (Handoff × .20)`
`+ (SOP Compliance × .15)`
Then:
`Final Processing Quality = (QA Processing Score × .70) + (Deletion Rate × .30)`

2. COMPLAINTS & MAILING QA SCORECARD
The Complaints/Mailing department receives the same shared Deletion Rate for the dispute cycle if it legitimately participated in that round.
QA Workmanship has its own checklist.
Section weights:
A. Complaint Filing Accuracy — 25%
Checklist:

1. Correct client/file selected
2. Correct complaint channel selected
3. FTC filed only when required
4. BBB filed only when required
5. CFPB filed only when required
6. Correct creditor/furnisher/bureau identified
7. Complaint facts accurately match file
8. Correct account information used
9. Correct dispute issue described
10. No unsupported/inaccurate factual claims
11. Required supporting documentation attached
12. Confirmation/reference number captured

Section weight: 25%
B. Mailing Accuracy & Execution — 20%
Checklist:

1. Correct letter/package used
2. Correct recipient
3. Correct mailing address
4. Correct client information
5. Correct account/bureau/furnisher
6. Required supporting documents included
7. Correct mailing method used
8. Mailing completed within SLA
9. Tracking/reference captured where applicable
10. Proof/confirmation stored

Section weight: 20%
C. Bureau / Portal Upload Accuracy — 20%
Checklist:

1. Correct bureau selected
2. Correct client selected
3. Correct complaint/dispute documentation uploaded
4. Correct supporting evidence uploaded
5. Correct account information
6. Upload submitted successfully
7. Confirmation/reference captured
8. No duplicate unnecessary submission
9. Correct upload date recorded
10. File/status updated after upload

Section weight: 20%
D. Handoff Execution & Completion — 20%
Checklist:

1. Processing handoff reviewed completely
2. Required downstream actions identified
3. All required actions completed
4. Missing information escalated promptly
5. No required complaint skipped
6. No required mailing skipped
7. No required bureau upload skipped
8. Completion communicated back to Processing/CreditOps workflow
9. Correct downstream status applied
10. Handoff closed only after all required actions completed

Section weight: 20%
If Processing handoff was incomplete:
QA should identify:
`Upstream Handoff Defect`
Do not automatically penalize Complaints/Mailing for work it could not correctly perform due to missing upstream information.
Attribute the defect to the responsible Processing QA section.
If Complaints/Mailing had sufficient information but failed to act:
score the Complaints/Mailing item normally.
E. Documentation, SOP & Workflow Compliance — 15%
Checklist:

1. Current SOP followed
2. Correct sequence followed
3. Correct complaint/mailing timing
4. Correct tracker status
5. Correct GHL/CreditOps status updated where required
6. Required notes completed
7. Required evidence stored
8. Correct escalation path used
9. File not prematurely closed
10. No unauthorized shortcut

Section weight: 15%
COMPLAINTS & MAILING QA FORMULA
`QA Complaints Score =`
`(Complaint Accuracy × .25)`
`+ (Mailing Accuracy × .20)`
`+ (Upload Accuracy × .20)`
`+ (Handoff Execution × .20)`
`+ (SOP/Documentation × .15)`
Then:
`Final Complaints Quality = (QA Complaints Score × .70) + (Deletion Rate × .30)`

SHARED RESULTS LOGIC
One dispute round has one canonical results record.
Example:
Client: Jane Smith
Round: 3
Processor: Julius Rivera
Complaints/Mailing: Ivan Olympia
Items Disputed: 20
Deleted: 8
Corrected: 3
Partial Improvement: 1
Remains: 6
Pending: 2
`Deletion Rate = 8 / 20 = 40%`
`Resolved Items = 18`
`Positive Outcome = (8 + 3 + 1) / 18 = 66.67%`
Both legitimate contributors receive:
`Shared Deletion Rate = 40%`
But:
Julius' QA workmanship comes from the Processing scorecard.
Ivan's QA workmanship comes from the Complaints/Mailing scorecard.

ATTRIBUTION RULE
A person receives the shared result only if they were an actual contributor to that dispute cycle.
Do NOT attribute every result to every employee in the department.
Store contributor identity canonically at the work/dispute-cycle level.

QA GRADES
For QA Workmanship and Final Quality:
95–100 Exceptional
90–94.99 Strong
85–89.99 Meets Standard
80–84.99 Coaching Needed
70–79.99 Improvement Required
Below 70 Critical Improvement
Confirmed Critical Error: Critical Failure regardless of raw checklist result

PRODUCTIVITY KPI FOR DISPUTE PROCESSING
Productivity/Output = 100-point score.
Weight internally:
Completed Files/Rounds vs Target — 50%
`completed ÷ expected target`, capped at 100
On-Time/SLA Completion — 30%
`on-time completed ÷ total completed`
Backlog Control — 20%
percentage of assigned actionable files not overdue
Formula:
`Processing Productivity =`
`(Target Achievement × .50)`
`+ (SLA × .30)`
`+ (Backlog Control × .20)`

PRODUCTIVITY KPI FOR COMPLAINTS & MAILING
Required Actions Completed vs Target — 50%
On-Time/SLA Completion — 30%
Backlog Control — 20%
Formula:
`Complaints Productivity =`
`(Output Achievement × .50)`
`+ (SLA × .30)`
`+ (Backlog Control × .20)`

COMPLIANCE KPI
Keep Compliance separate from QA so the company-level KPI remains:
Quality 35
Productivity 35
Compliance 20
Attendance 10
Processing Compliance:
SOP adherence — 30%
Required documentation — 25%
Correct workflow/status/pipeline — 20%
Required reporting/EOD — 15%
Escalation/exception handling — 10%
Complaints/Mailing Compliance:
Correct filing/channel process — 30%
Required evidence/documentation — 25%
Workflow/status adherence — 20%
Required reporting/EOD — 15%
Escalation/exception handling — 10%
These should be derived from system facts and QA findings wherever possible.
Do not require a Team Lead to manually score the same behavior twice.

OVERALL EMPLOYEE PERFORMANCE
Both departments use the BES framework:
Quality 35%
Productivity & Output 35%
Compliance 20%
Attendance & Reliability 10%
Formula:
`Overall Performance =`
`(Final Quality × .35)`
`+ (Productivity × .35)`
`+ (Compliance × .20)`
`+ (Attendance × .10)`
EXAMPLE
Julius:
Processing QA = 95%
Deletion Rate = 50%
`Final Quality = (95 × .70) + (50 × .30)`
`= 66.5 + 15`
`= 81.5%`
Productivity = 92%
Compliance = 96%
Attendance = 98%
Overall:
`(81.5 × .35) + (92 × .35) + (96 × .20) + (98 × .10)`
`28.525 + 32.2 + 19.2 + 9.8`
89.725% Overall Performance
Display:
89.7% · Meets/Strong Performance according to the separate overall-performance grading policy.

TEAM LEAD UX
The Team Lead should NOT manually type percentages.
They:

1. Open dispute-cycle QA.
2. Mark each checklist item: Pass / Minor / Major / N/A.
3. Mark Critical Error if applicable.
4. Review/confirm dispute results.
5. Add feedback.
6. Complete QA.

FullSuite calculates:

* section scores
* QA Workmanship
* Deletion Rate
* Positive Outcome Rate
* Final Quality
* employee monthly/quarterly Quality KPI
* team Quality KPI
* eventual overall employee KPI

IMPORTANT VERSIONING
The dispute process changes over time.
Therefore QA templates must be versioned.
Example:
`CreditOps Processing QA v1`
effective date
active/inactive
sections
questions
weights
severity options
QA review stores which template version was used.
Changing SOP/checklist later must NOT rewrite historical QA scores.

FOUR-VIEW RULE
Test:
Agent — sees own completed QA, feedback, results and Quality KPI.
Team Lead — performs QA for authorized team members and sees team scores.
Division Manager — sees Processing + Complaints/Mailing quality across their authorized CreditOps scope.
Executive — sees organization rollups/trends according to capability.
Role determines experience.
Placement determines scope.
Capability determines action.
Never hardcode names.

The main thing I'd lock before Claude builds it is the 70% workmanship / 30% deletion rate split. Given how important actual deletions are to your CreditOps service, 30% is substantial enough to materially change Quality, but still leaves most of the grade under your team's direct control.

---

# Part 2 — QA sampling standard (Dee, 2026-09-19, verbatim)

For your setup, I would **not have the Team Lead review 3–5 files every week for every agent** as the permanent standard. That can turn QA into a full-time job very quickly.

I recommend **5 completed files per agent per month** as the normal baseline, with **risk-based additional reviews** when something is wrong.

That gives you enough sampling to identify patterns without overwhelming Daniel or whoever is doing QA.

### Recommended BES CreditOps QA Sampling

| Agent status | QA reviews | Why |
| --- | ---: | --- |
| New agent / first 30 days | **3 files/week** | Catch training and process issues quickly |
| Established agent | **5 files/month** | Normal ongoing QA sample |
| Strong performer, consistently 95%+ | **3 files/month** | Reduced sampling after proven consistency |
| QA below 90% | **3 files/week** temporarily | Increased monitoring/coaching |
| QA below 85% | **5 files/week** temporarily | Significant quality concern |
| Critical Error | **5 consecutive submissions reviewed** | Verify correction before returning to normal sampling |
| New SOP/process launched | **First 3 applicable files** | Confirm the change is being followed |

This is much better than treating everyone identically forever.

### How FullSuite should choose the files

I would **not let the agent choose which files get reviewed**.

The scorecard should be based entirely on **actual work submitted by that agent**, exactly as you described.

When Julius completes a dispute round, for example:

> Round completed → Julius submits work → file becomes **QA Eligible**

FullSuite builds that agent's eligible pool.

Then the system should automatically select the monthly QA sample from their submitted work.

I would use **randomized + risk-based sampling**, rather than purely random selection.

For the normal 5 monthly reviews:

**3 Random Files** — Randomly selected from the agent's completed work.

**1 Risk-Based File** — Something potentially higher-risk, such as a complex file, later dispute round, multiple bureaus/furnishers, complaint handoff required, or previous QA issue.

**1 Follow-Up File** — A file submitted after the employee received previous QA feedback, so the Team Lead can determine whether the issue was corrected.

If the agent has no previous issue that month, make this another random/risk-based file.

This prevents cherry-picking while still making QA useful for coaching.

### Don't wait until month-end

I'd still define the official sample as **5 per month**, but distribute it across the month.

> Week 1: 1 file · Week 2: 1 file · Week 3: 1 file · Week 4: 2 files

The exact days don't matter. FullSuite can spread selections automatically.

This is better than Daniel suddenly receiving 40 QA reviews on the last day of the month.

### The monthly Quality score

If Julius has five completed QA reviews:

| Review | QA Workmanship |
| --- | ---: |
| File 1 | 96% |
| File 2 | 91% |
| File 3 | 94% |
| File 4 | 88% |
| File 5 | 97% |
| **Monthly QA Average** | **93.2%** |

His monthly **QA Workmanship = 93.2%**.

But there is an important change I recommend for the deletion component.

Deletion results frequently won't be available when the Team Lead performs QA. So **don't force the QA review to wait for results**.

Treat them as two timelines:

**Workmanship QA** is scored immediately after the agent submits the work.

**Results** are attached later when the credit report is reimported/reviewed.

So FullSuite might initially show:

> Processing QA: **93.2%** · Deletion Rate: **Pending** · Quality: **Provisional**

Later, when results arrive:

> Processing QA: **93.2%** · Deletion Rate: **47.5%** · Final Quality: **79.5%**

using your: `(93.2 × 70%) + (47.5 × 30%) = 79.49%`

### One adjustment I'd make to deletion-rate sampling

I would **not calculate the employee's deletion rate using only the five QA files**. That would make the result statistically noisy and unnecessarily dependent on which five files happened to get selected.

Instead:

**QA Workmanship = sampled work**

but

**Deletion Rate = ALL eligible dispute rounds completed by that agent whose results became available during the measurement period.**

That's much stronger.

For example: Julius completed 52 dispute rounds. Only 5 are manually QA reviewed. Eventually 38 of his eligible rounds have results available. His performance becomes:

> QA Workmanship **93.2%** — Based on 5 sampled reviews
> Deletion Rate **51.8%** — Based on 38 resulted rounds / 426 disputed items
> Positive Outcome Rate **68.4%**
> Final Quality **80.8%**

Now you're using human QA efficiently while using **all available system data for results**.

### Complaints & Mailing should work the same way

Ivan submits his work on the same dispute cycle. FullSuite selects approximately **5 completed Complaint/Mailing files per month** for QA. The Team Lead scores Ivan's actual work. When the eventual dispute result comes in, the same canonical result is attributed to Julius and Ivan because both participated in that cycle.

So you could eventually see:

> **Julius Rivera — Processing** · 5 QA reviews · Workmanship: 93.2% · Deletion Rate: 51.8% · Final Quality: 80.8%

and:

> **Ivan Olympia — Complaints & Mailing** · 5 QA reviews · Workmanship: 96.1% · Shared Deletion Rate: 49.7% · Final Quality: 82.2%

Their deletion rates may differ across the month because they won't necessarily have worked on exactly the same set of files.

### Team Lead workload stays manageable

If Daniel has 5 processors: **5 agents × 5 reviews = 25 QA reviews/month** — roughly **6 reviews per week**. If each structured QA takes around 10–15 minutes once the system is efficient, that's a reasonable ongoing QA workload. The system then automatically increases sampling only for the people who need closer supervision.

I would lock the BES standard as:

> **Standard QA Sample: 5 files per agent per month**
>
> QA is performed against completed work actually submitted by the agent.
>
> Sampling is system-selected and distributed throughout the month.
>
> New employees, low QA scores, critical errors, coaching periods, and major SOP changes automatically trigger increased sampling.
>
> **Manual QA is sampled. Dispute results are measured across all eligible resulted work.**

That last sentence is especially important. It gives you a much more credible performance system without burying your Team Leads in reviews.

---

# Part 3 — Dee's decisions on the analysis (2026-09-19, verbatim)

Claude's analysis is aligned with what we designed, and the existing FullSuite architecture can support it without creating a separate CreditOps-only scoring engine. The key existing pieces are already there: `fulfillment_clients`, department handoffs, `production_logs`, `client_work_checklist`, `dispute_rounds`, and the round-outcome writer. The main missing layer is the versioned scorecard/review engine and richer round-level result tracking.

I would answer Claude's remaining decisions like this:

Proceed with these decisions:

**1. Results Window: APPROVED**
Workmanship QA is scored immediately when the selected completed work is reviewed. Do not wait for dispute results.
Until results are available: `QA Workmanship = Final` · `Deletion Rate = Pending` · `Quality KPI = Provisional`
Once eligible results are recorded, automatically recalculate: `Final Quality = (QA Workmanship × 70%) + (Deletion Rate × 30%)`
Do not require the Team Lead to reopen the original QA review. Historical QA Workmanship must remain frozen. Only the result component updates.

**2. Contributor Attribution: APPROVED WITH CONTROL**
Derive contributors automatically from actual production activity for the client + dispute round + department. A Team Lead may correct/add a contributor only when necessary. Manual attribution changes require: reason · changed by · timestamp · audit history. Never attribute results simply because someone belongs to the department.

**3. QA Opens on the CreditOps Client Round: APPROVED**
The canonical QA context is: `Client → Dispute Round → Department Work → QA Review`. Do not make an isolated work item the source of truth. A round can have separate department QA reviews (`Dispute Processing QA`, `Complaints & Mailing QA`) while sharing the same canonical round results.

**4. Grade Bands: APPROVED**
Keep the QA/Quality grading bands separate from the existing Overall Performance bands.
QA Workmanship / Final Quality: `95–100 = Exceptional` · `90–94.99 = Strong` · `85–89.99 = Meets Standard` · `80–84.99 = Coaching Needed` · `70–79.99 = Improvement Required` · `<70 = Critical Improvement` · `Confirmed Critical Error = Critical Failure`
Keep these configurable/versioned as data. Do not replace the existing overall employee-performance grading bands with these.

**5. QA Verdict: APPROVED**
`Passed = Final QA Workmanship ≥85 with no confirmed Critical Error` · `<85 = Needs Review / Coaching`
A confirmed Critical Error overrides the normal pass verdict and caps QA Workmanship at 59%.
Do NOT use deletion rate to determine whether the original work passed QA.
QA Pass/Fail answers: "Was the work performed correctly?" Final Quality answers: "What was the quality of the work when workmanship and actual dispute results are considered?"

**6. Minimum Thresholds**
For now use: `Quality minimum standard = 85%` · `Compliance minimum standard = 90%`
These are performance flags, not mathematical overrides.
Example: Overall Performance: 91% · Compliance: 82% ⚠ Below Standard
The employee may mathematically have a high overall score, but FullSuite must still surface the threshold exception. Make thresholds policy-configurable rather than hardcoded.

**7. Productivity Targets**
Do NOT invent production targets yet. Build the architecture to support versioned targets by: `Division → Department → Position → Metric → Effective Date`
Until I provide the actual expected output targets, FullSuite may show production counts, SLA performance, completed work and backlog metrics, but it must not manufacture a Productivity KPI from arbitrary targets. We will define the production standards separately.

**8. Department Scorecards: APPROVED**
This implementation is specifically for: `CreditOps → Dispute Processing` · `CreditOps → Complaints & Mailing`
Do not treat this as the universal checklist for BES. Every division/department can have its own versioned scorecard template using the same generic QA engine.
Future examples: CreditOps → Client Success/Support · BES CRM → Build QA · TalentOps → Service QA · Sales & Marketing → appropriate QA
Adding those scorecards should primarily be configuration/data, not another scoring engine.

**QA SAMPLING POLICY**
Lock the standard baseline at: 5 completed files per agent per month. The agent does NOT choose the files. QA must be based on actual submitted/completed work. FullSuite automatically selects and distributes the sample throughout the month.
Normal established-agent sample: `3 random completed files` · `1 risk-based completed file` · `1 follow-up/coaching file`. If there is no applicable follow-up/coaching file, select another random/risk-based file.
Sampling escalation: New agent, first 30 days: `3/week` · Established: `5/month` · Consistently ≥95%: `3/month`, only after sufficient historical consistency · QA below 90%: `3/week temporarily` · QA below 85%: `5/week temporarily` · Critical Error: `next 5 consecutive applicable submissions` · Major new SOP/process: `first 3 applicable submissions`
Sampling rules themselves must be configurable policy rather than hardcoded throughout the application.

**MONTHLY QA WORKMANSHIP**
Monthly QA Workmanship is based on the completed QA sample. Example: 96, 91, 94, 88, 97 → `(96 + 91 + 94 + 88 + 97) / 5 = 93.2%`. Do not manually enter this monthly percentage. Derive it from completed QA reviews.

**IMPORTANT: DELETION RATE IS NOT SAMPLED**
QA Workmanship = sampled work. Deletion Rate = ALL eligible resulted dispute work attributable to that agent during the measurement period. Do NOT calculate an employee's monthly deletion rate using only their 5 QA-reviewed files.
Example: Agent completed 52 rounds. 5 were manually QA reviewed. 38 eligible attributable rounds now have results. QA Workmanship is calculated from the 5 reviews. Deletion Rate is calculated from all eligible resulted work across those 38 rounds. This prevents the random QA sample from distorting actual dispute results.

**DELETION RATE**
`Deletion Rate = Deleted Items / Total Eligible Disputed Items × 100`
`Positive Outcome Rate = (Deleted + Corrected/Updated + Partial Improvement) / Resolved Items × 100`
Display both. Deletion Rate feeds the 30% Results component of Quality. Positive Outcome Rate remains a supporting CreditOps outcome metric for now. Pending results must not silently become zero. Show them as Pending and exclude them according to the defined results-state rules.

**PROCESSING + COMPLAINTS CONNECTION**
Preserve the shared dispute-cycle architecture. Dispute Processing and Complaints & Mailing have separate Workmanship QA scores but share attributable dispute outcomes.
Processing owns: report review · dispute strategy · CRA/furnisher letters · round documentation · DisputeFox/Credit Repair CRM updates · CreditOps tracker/status · GHL pipeline/status · downstream handoff · current SOP compliance.
Complaints & Mailing owns: complaint execution · FTC/BBB/CFPB actions when applicable · mailing · bureau/portal uploads · downstream documentation · status completion · escalation of incomplete handoffs · current SOP compliance.
If Processing failed to provide a usable handoff, attribute that defect to Processing. Do not automatically penalize Complaints/Mailing for an upstream defect outside its control. If Complaints/Mailing received a complete actionable handoff and failed to execute it correctly, attribute the defect to Complaints/Mailing. Results can still be shared across legitimate contributors.

**SOP VERSIONING**
Mandatory because our CreditOps process changes. QA templates must support: template name · division · department · version · effective_from · effective_to · active status · sections · section weights · checklist items · severity behavior · critical-error definitions · applicability/N/A rules.
Historical QA reviews remain attached to the exact template version used when reviewed. Publishing a new SOP/QA version must never recalculate old Workmanship scores.

**TEAM LEAD WORKFLOW**
Keep this extremely simple in the UI. The Team Lead should not calculate anything manually.
`Open assigned QA review` → inspect the agent's submitted work → mark `Pass / Minor Issue / Major Issue / N/A` → identify Critical Error if applicable → add feedback/corrective action where required → Submit QA
FullSuite calculates everything else. Show a live score while reviewing, but freeze the Workmanship result when submitted.

**RESULTS WORKFLOW**
Results can arrive later. When CreditOps records/reimports results: update the canonical dispute-round outcomes → recalculate applicable agent Deletion Rate → recalculate Final Quality → update team/division rollups → preserve the original QA review unchanged. Do not create duplicate result records for Processing and Complaints.

**DO NOT BUILD YET**
Before implementation, update the architecture proposal with these decisions and show me:
1. proposed canonical tables/relationships
2. how existing `dispute_rounds`, `production_logs`, handoffs and `client_round_outcomes` will be reused/migrated
3. exact score calculation flow
4. QA sampling state machine
5. results attribution rules
6. Team Lead workflow
7. Agent view
8. Team Lead view
9. Division Manager view
10. Executive view
11. handling of pending results
12. historical/versioning behavior
13. prevention of duplicate attribution and double-counting
Do not create parallel sources of truth. Do not hardcode people. Do not invent productivity targets. Do not push until I approve the final architecture.

One thing I especially agree with from Claude's review is making this a generic versioned scorecard engine with the two CreditOps scorecards seeded as data, rather than building special Processing/Complaints code. That gives you the exact CreditOps behavior now while letting Client Success, BES CRM, TalentOps, and future departments have completely different scorecards later without rebuilding the system.
And the sampling decision is now clean: 5 QA files/month is the standard, but deletion performance uses all eligible resulted work, not those five samples.

Yes to Claude's proposals, with a few important definitions tightened before the build:

> Yes. Lock the remaining CreditOps QA decisions as follows.
>
> **#2 Contributor attribution: APPROVED WITH AUDIT CONTROL** — Primary attribution should be automatic from actual production activity tied to the specific `client + dispute round + department`. Team Leads may manually add, remove, or correct a contributor only when necessary. Any manual change requires: reason · changed by · timestamp · audit history. Department membership alone does NOT make someone a contributor. Do not attribute deletion results to someone simply because they touched the client at another time.
>
> **#3 QA opens on the CreditOps client's round: APPROVED** — Canonical hierarchy: `Client → Dispute Round → Department Work → QA Review`. A single dispute round may contain Dispute Processing QA, Complaints & Mailing QA, and shared canonical Results. Do not duplicate results between departments.
>
> **#4 Band sets: APPROVED** — Workmanship QA and Final Quality use the six QA grades plus Critical Failure. Keep the existing overall Performance bands separate. These bands must be policy/configuration data, not hardcoded UI logic.
>
> **#5 QA verdict: APPROVED** — `Passed = Workmanship QA ≥85% AND no confirmed Critical Error` · `Below 85% = Needs Review / Coaching` · `Critical Error = Critical Failure`. The QA verdict is based on Workmanship, NOT deletion rate. Workmanship answers: **Was the submitted work performed correctly?** Final Quality answers: **How strong was the employee's quality when workmanship and actual dispute results are combined?** Do not retroactively change a submitted QA verdict because later deletion results were low.
>
> **#6 Minimum thresholds: LOCK** — **Quality minimum = 85%** · **Compliance minimum = 90%**. These are minimum-standard flags, not mathematical caps. Example: Overall Performance 92% · Quality 83% ⚠ Below Standard. The 92% remains mathematically correct, but the employee is flagged because Quality failed its minimum standard. Same principle for Compliance. Make thresholds versioned/configurable policy.
>
> **#7 Per-position Productivity targets: DO NOT SET YET** — Do not invent targets. Build the framework now so targets can later exist by `Division → Department → Position → KPI Metric → Target → Effective Date`. Until I approve actual production targets, show factual operational metrics (files/rounds completed · actions completed · SLA/on-time percentage · overdue work · backlog · workload) but do NOT manufacture a Productivity score from arbitrary numbers. Productivity remains pending/not fully scored until the applicable target policy exists.
>
> **#9 Consistently 95%+: APPROVED AS 3 CONSECUTIVE MONTHS** — Reduced sampling from 5/month to 3/month requires **3 consecutive completed monthly QA periods with Workmanship QA ≥95%**. Use Workmanship QA, not Final Quality. No Critical Error may have occurred during those 3 months. If either condition fails, normal sampling continues.
>
> **#10 When increased sampling lifts: MODIFY** — Do NOT make every escalation require one full calendar month automatically.
> **QA below 90%**: increase to 3 reviews/week. Return to standard 5/month after `5 consecutive reviewed submissions ≥90%` with no Major Issue or Critical Error.
> **QA below 85%**: increase to 5 reviews/week. Return first to the 3/week monitoring tier after `5 consecutive reviewed submissions ≥85%` with no Critical Error. Then return to standard 5/month after `5 additional consecutive reviewed submissions ≥90%` with no Major Issue or Critical Error.
> **Critical Error**: review the next 5 consecutive applicable submissions. If all five pass ≥85% with no additional Critical Error, return to the appropriate sampling tier based on current QA history.
> Do not automatically return someone to normal sampling merely because a calendar month ended. The purpose is to verify corrected behavior.
>
> **#11 Complaints & Mailing "file": APPROVED** — One QA-eligible Complaints & Mailing file means **one dispute round's downstream work package for that client.** It may contain multiple actions (FTC · BBB · CFPB · CRA/bureau upload · mailing · supporting-document submission · tracking/confirmation · system/status updates). Do NOT count each action as a separate QA file. QA evaluates the downstream work package as a whole while still grading individual applicable checklist items. Use N/A for actions that were legitimately not required for that round.
>
> **IMPORTANT SAMPLING CLARIFICATION** — The QA sampling engine should primarily evaluate **Workmanship QA**, not Final Quality. Low Workmanship, Critical Errors, new employees and new SOP/template versions trigger additional sampling. A low Deletion Rate by itself should NOT automatically cause 5 QA reviews/week. Instead, low deletion performance should create a **Results/Performance Attention flag** for the Team Lead, who investigates (dispute strategy · Processing workmanship · Complaints/Mailing execution · account mix · later-round difficulty · bureau/furnisher outcomes · other). If that identifies a workmanship concern, the Team Lead can trigger enhanced QA sampling with a documented reason.
>
> **QUALITY TIMELINE** — `Workmanship QA = immediate + frozen` · `Deletion Rate = develops as results arrive` · `Final Quality = 70% Workmanship + 30% Deletion Rate`. Before eligible results exist: **Quality = Provisional**. Do NOT treat Pending results as 0%.
>
> **MONTHLY DELETION RATE** — Use ALL eligible resulted rounds attributable to that employee for the period. The dashboard must always expose the denominator: **Deletion Rate 51.8%** · `426 disputed items · 38 resulted rounds` · **Positive Outcome Rate 68.4%**. A 60% rate on 5 items must not look like a 60% rate on 500.
>
> **NO DOUBLE COUNTING** — A dispute item/result exists once canonically under its dispute round. It may be attributed to legitimate Processing and Complaints/Mailing contributors for individual analytics, but attribution must NOT create duplicate dispute results. Organization/team result reporting must aggregate canonical dispute outcomes, NOT sum employee-attributed totals. This rule is mandatory.
>
> **BUILD ORDER APPROVED**
> 1. Generic versioned QA engine/schema · 2. CreditOps dispute-round canonical linkage · 3. Seed Dispute Processing QA template · 4. Seed Complaints & Mailing QA template · 5. QA eligibility + sampling policies · 6. Daily selection/sampling sweep · 7. Team Lead QA queue and review UI · 8. Agent QA results/feedback view · 9. Round results + attribution · 10. Provisional → Final Quality calculation · 11. Performance integration · 12. Team/Division/Executive rollups · 13. Audit/versioning/history
> Do not build other departments' scorecards yet. This engine must support them later as data/configuration.
>
> **FOUR-VIEW UAT IS REQUIRED** — Agent: own QA reviews, feedback, Workmanship, deletion/results, provisional/final Quality, cannot grade themselves. Team Lead: QA queue for authorized team, performs QA, sampling status, coaching/escalated sampling, team Quality/results. Division Manager: authorized CreditOps departments, Processing vs Complaints quality, QA completion, deletion/results trends, exceptions, team/agent drilldown. Executive: organization-level rollups by capability, CreditOps quality/result trends, department comparisons, exceptions, drilldown by scope/capability. Test navigation, record scope, actions, direct routes, RPC/API authorization and denied states for all four.
>
> **PUSH** — Yes, push the currently committed and gate-green `main` containing the Workforce IA, Performance page, monthly rates and P-007 attendance fix. Keep the new CreditOps QA build as the next controlled implementation after the push. After the push, verify production deployment and run the previously required live P-007/Workforce regression checks before beginning the QA schema implementation. Then proceed with the approved QA build order above.

The main change I made to Claude's proposal is #10. I would **not wait an arbitrary full month to reduce enhanced QA**. Five consecutive good submissions gives Daniel a much clearer signal that the specific behavior has actually been corrected.

I also strongly recommend the **no-double-counting rule** above. Since Processing and Complaints share dispute results, the same deletion can legitimately contribute to both employees' individual Quality analytics, but it must remain **one deletion** when you look at CreditOps, Partner, or company results.
