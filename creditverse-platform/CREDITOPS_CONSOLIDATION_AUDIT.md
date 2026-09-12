# CreditOps UX Consolidation — audit and mapping

Dee, 2026-09-11: *"STOP adding more sections to this client page… I want a
MAJOR UX CONSOLIDATION, not another section added to the existing page…
The backend can remain sophisticated. The employee-facing experience must be
SIMPLE."*

Part 11 of her brief requires this mapping **before any code changes**. Every
currently visible section and navigation item is classified here. Nothing in
the database is removed; this governs presentation only.

The design test for every decision below is her four questions:

1. Where is this client now?
2. What needs to be done?
3. When is it due?
4. What information/files do I need to do it?

---

## A. Client profile — every section that renders today

Source: `ClientWorkWorkspace.tsx` (443 lines) and the components it mounts.

| # | Section today | Where it lives now | Destination | Note |
|---|---|---|---|---|
| 1 | `ClientContextBar` (sticky compact bar) | top, on scroll | **HEADER** | keep; it already answers Q1–Q3 in one line |
| 2 | `ClientWorkHeader` | top | **HEADER** | becomes the single operational header |
| 3 | `ClientLifecycleControl` (Active / Archive) | own panel, top | **MANAGEMENT ONLY** | Active becomes a badge; the control moves to More → Manage Client |
| 4 | `ClientStatusControl` (credit status) | own panel, top | **HEADER** (badge) + **WORK** | the badge shows it; changing it is a work action |
| 5 | "Open client profile (report, disputes, letters)" link | own row | **MORE** | only when the partner uses the BES credit CRM |
| 6 | Main Description (editor, always mounted) | left column | **CLIENT INFO** | hidden entirely when empty — no "Nothing recorded" card |
| 7 | Next Action (own card) | left column | **WORK** — inside Current Work | no separate card; hidden when empty |
| 8 | `ClientProgressReport` ("8 completions recorded") | left column | **HISTORY** | completed work is history, not a second timeline |
| 9 | `ClientWorkflowActions` (Mark as Mailed / Support / FTC / CFPB — all four, always) | left column | **WORK** — contextual | only the actions valid for the current department |
| 10 | `ClientAssignmentCard` (round, agent, processed, mailed, SLA override) | left column | split: round + agent → **WORK**; processed/mailed → contextual actions; SLA override → **MANAGEMENT ONLY** |
| 11 | Workability panel | left column | **WORK** — small indicator | ✓ Workable inline; Report Blocker stays a contextual action |
| 12 | Checklist (always mounted, in-memory only) | left column | **WORK** | hidden when empty; today it does not persist at all — see Gap 1 |
| 13 | `CompleteWorkSection` (446 lines, always expanded) | left column | **WORK** — behind `[Complete Work]` | becomes a drawer that asks only what this department needs |
| 14 | Department handoff checkboxes | inside Complete Work | **WORK** — inside the drawer's "What happens next?" | valid destinations only |
| 15 | `ClientWorkAttachments` | left column | **DOCUMENTS** | one home for every file |
| 16 | `ClientSecretsPanel` (SSN / monitoring / portal) | right column | **CLIENT INFO** | capability, masking, reveal, copy and audit unchanged |
| 17 | `FundingReadinessCard` | right column | **CLIENT INFO** (only when a funding record exists) | no empty cross-module card |
| 18 | `ClientWorkActivityTimeline` + comment composer | right column | **HISTORY** | one merged, human-readable history |
| 19 | Clipboard paste listener | window-level | **DOCUMENTS** | scoped to the Documents tab |

### Gaps this audit exposes (not in Dee's list, found while mapping)

1. **The checklist is fake.** `checklists` is `useState` in the component and is
   never written anywhere — "they are not saved between visits" is in the copy.
   Dee's brief treats the checklist as real work state. Consolidating it into
   the Work tab without persisting it would move a broken feature rather than
   fix it.
2. **The workability blocker is half-real.** It writes an activity entry but
   the blocked state itself is `useState` — reload and the file is workable
   again.
3. **Attachments are in-memory too.** `ClientWorkAttachments` starts empty every
   visit; the imported ClickUp files live in storage and are not read here.

These three are why the page *feels* like it has more than it does. They are
recorded so consolidation does not quietly bless them.

---

## B. Navigation — every item that renders today

Two lists exist. The management sidebar (`CreditOpsTreeSidebar`
→ `MANAGEMENT_VIEWS`) and the partner workspace tabs
(`creditops-partners.ts` → `PARTNER_VIEWS`). Both show everything to everyone
today, because `RoleAccess.views` is `[]` for every role and the filter reads
`views.includes(id)` — an empty list means "no filter".

| Item | Today | Destination |
|---|---|---|
| Dashboard | everyone | **UNIVERSAL** (personalized by department) |
| Main Client List | everyone | **UNIVERSAL** — the shared CreditOps directory, never filtered by department or assignment |
| Dispute Queue | everyone | **DEPARTMENT** — Dispute |
| Onboarding Queue | everyone | **DEPARTMENT** — Onboarding |
| Support Queue | everyone | **DEPARTMENT** — Support |
| Complaints & Mailing | everyone | **DEPARTMENT** — Complaints |
| Bureau Calling | everyone | **DEPARTMENT** — Bureau Calling |
| Escalation Queue | everyone | **MANAGEMENT ONLY** — escalations surface contextually on an agent's own work |
| CRM Signal Log | everyone | **RELOCATE** — Admin/management tooling |
| SOPs & Logins | partner tabs only | **UNIVERSAL** — scoped to the person's departments |
| Managed Ops / Outsourcing partner tree | everyone | **MANAGEMENT ONLY** for the full tree; agents see the partners their work touches |

---

## C. The authorization already in place — what we reuse, and the one gap

Dee: *"Use our EXISTING canonical team assignments, department assignments,
partner assignments, roles and capabilities. DO NOT create another
sidebar-specific role/access system."*

What exists and is reused unchanged:

| Question | Canonical answer today |
|---|---|
| Which departments may I work? | `RoleAccess.departments` via `resolveOpsAccess` → `useCreditOpsAccess().allowedDepartments` |
| May I log work at all? | `RoleAccess.canLogWork` → `canLogDepartment(dept)` |
| May I see the management layer? | `RoleAccess.canAccessManagement` |
| Which files are mine? | `client_department_statuses.assignee_id` → `useMyDepartmentFiles()` |
| Which teams am I in? | `auth.teamIds` / `auth.ledTeamIds`, resolved once per session |
| May I see a client at all? | Row Level Security on `fulfillment_clients` — `bes_may_fulfil` / `in_scope` |
| May I see an SSN or a password? | `client_secret_reveal`, capability-checked and audited |
| May I override an SLA date? | `ops.manage` |
| May I delete? | `is_owner_of` — owner only, already locked |

**The gap.** For BES staff, `agencyRoleAccess()` returns *every* department for
*every* agency role — so Jezel in Complaints resolves to all five. That is the
single reason the interface cannot tell departments apart today, and it is why
everyone sees all nine tabs.

The fix is not a new role system. `teams` already carries `department_id`, and
`auth.teamIds` already says which teams a person is in. A BES staff member's
departments become **the departments of the teams they belong to**, with two
deliberate fall-backs:

* management roles (owner / admin / manager) keep every department, because
  managing the operation is their job;
* a staff member in no department-bearing team keeps read access to the shared
  client directory and gets no department queue — default deny (rule 1), not a
  lockout, because Main Client List is universal by Dee's instruction.

---

## D. View mode vs work mode — one client record, two presentations

Dee: *"Do NOT create separate client records or separate profiles. Same
canonical client. The UI changes according to authorization/context."*

```
canWorkCurrent = canLogDepartment(currentDepartment)
```

* **true** → WORK MODE: Complete Work, Report Blocker, contextual actions.
* **false** → VIEW MODE: the same header and the same four tabs, with the
  work controls absent (not disabled) and a line saying which department holds
  the file.

Both modes read the identical record through the identical query. Nothing is
hidden with CSS, and nothing new is fetched for one mode that the other cannot
have — the database already refuses what it refuses.

---

## E. Order of work

1. **Navigation** — department-derived tabs and sidebar; Escalation and CRM
   Signal Log to management; SOPs & Logins universal.
2. **Client profile** — one header, four tabs, Complete Work as a drawer,
   contextual actions, view mode vs work mode.
3. **History** — one human-readable projection over the raw audit rows,
   including the ClickUp import, with the `undefined` artefacts fixed.
4. **Dashboard and My Work** — personalized by department; waiting files
   excluded from My Work.

Each ships whole, with the gate green, before the next begins (rule 20: one
active epic, parked deliberately).
