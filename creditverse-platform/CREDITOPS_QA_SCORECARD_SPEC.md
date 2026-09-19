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
