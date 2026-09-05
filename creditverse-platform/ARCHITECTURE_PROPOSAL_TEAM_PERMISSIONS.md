# Proposal — Team Members and Roles & Permissions, GHL-style, on the BES authorization chain

**Status: built 2026-09-05 (0064 keys/overrides/invitations, 0065 enforcement inside the functions, member permission tree, Copy Permission, accept-invitation page). Email sending still needs the mail provider key.** Dee's ask, from the GHL "My Staff → Edit or
manage your team" screen: an organization adds its own team members; each
member has *User Info* and *Roles & Permissions* — a role dropdown, a
"Restrict data visibility to only assigned data" switch, a searchable tree of
modules (a toggle per module, checkboxes per capability), and "Copy
Permission" from another member. Built today without a new model: the Team
Members list, the member page on the fields that exist, pending invitations.
Proposed here: the per-member permission tree, invitations that can be
accepted, and how both stay inside `Role + Permission + Scope + Assignment`.

## 1. What exists (FACT)

| GHL concept | BES today |
|---|---|
| Staff list | `org_memberships` (user, organization, `role` of 15 `org_role` values, `product`, `assigned_only`, `team_scope` text) joined to `profiles`; admins/managers of the organization may insert/update/delete other members (never themselves) |
| User Role dropdown | `org_role` enum (org_admin, org_manager, six credit_*, seven funding_*) |
| Restrict data visibility to only assigned data | **`org_memberships.assigned_only`** — already read by `org_scope_allows(org, assignee)`: admins see everything, others see records assigned to them unless the flag is off |
| Per-module permissions | **per role, not per member**: `organization_role_access` (0047) — for each role × product: departments (work/read), workspace views, can log work, can edit progress, management layer; platform defaults with an organization override, set through an audited function |
| Add a team member | `invitations` table (email, kind, organization, org_role, token, expiry, accepted_at); admins may write rows; **no delivery and no acceptance function exist**; the interface never used it |
| Copy Permission | — |
| Audit of permission changes | `organization.role_access_*` audit events for role configuration; membership changes are plain row writes |

## 2. Design (PROPOSAL)

### 2.1 Permission keys are data, evaluated in one place
```
permission_keys      key (module.action, e.g. creditops.letters.approve) · module · label · description ·
                     security_relevant boolean · sort
role_permissions     organization_id (null = platform default) · role · key · allowed     ← the module tree per role
member_permissions   membership_id · key · allowed · set_by · set_at · reason              ← per-member overrides
```
`member_can(p_org, p_key)` (SECURITY DEFINER, stable): override for the
caller's membership → else the organization's role row → else the platform
default for the role → else **deny**. Admins/managers of the organization
always allowed. The interface reads the same function once per session
(bundled in the auth context batch, rule 14) and offers only what it returns;
policies call it for the keys marked `security_relevant` (approve a letter,
confirm funding, record a lender decision, edit role access, invite a member,
export reports…). Frontend visibility is never the security (rule 1).

The existing `organization_role_access` row becomes the CreditOps/FundingOps
department/view part of the tree; nothing is duplicated — the tree renders it
and the new keys side by side.

### 2.2 Modules in the tree (organization view; only entitled modules render)
CreditOps · FundingOps · Custom Workspaces · BES CRM (customer-visible actions
only) · Clients · Reports · Team & Settings · Billing. Each module: an on/off
switch (all keys) and the individual checkboxes, searchable, exactly the GHL
interaction. Role defaults come from the platform table; "Default /
Configured" badges as in Roles & access today.

### 2.3 Scope stays a switch, not a permission
"Restrict data visibility to only assigned data" = `assigned_only`. It is
scope, evaluated by `org_scope_allows`, and it never becomes a permission key.

### 2.4 Copy Permission
Copies `member_permissions` rows (and role) from one member to another in one
function, audited with source and target. Never copies scope silently — the
dialog shows the assigned-only switch and asks.

### 2.5 Invitations that work
```
invite_team_member(p_org, p_email, p_role, p_assigned_only)   — SECURITY INVOKER; admins/managers only; one open invitation per email per organization
accept_invitation(p_token)                                     — SECURITY DEFINER; caller's auth email must equal the invitation email; not expired; creates the membership, stamps accepted_at, audits
```
Delivery is an Edge Function (`send-invitation`): the token never appears in
the browser except as the link the invitee opens; the mail provider key is a
secret. Seat counting (`organization_seat_usage`) already counts memberships;
pending invitations show against the plan's seat allowance before they are
accepted.

### 2.6 Interface
Settings › **Team Members** (first item of the organization group): list
(name, email, role, assigned-only, primary product, last sign-in when
available), search, "Invite team member". Member page: **User Info** (profile
fields, read-only except what the member owns) · **Roles & Permissions** (role
dropdown, assigned-only switch, module tree, Copy Permission, Save/Cancel).
BES HQ gets the same page for agency users under People & Access, with agency
roles and scopes (0021) in place of organization roles.

## 3. Authorization (no shortcuts)
- Who may edit members and permissions: organization owner/admin or the
  agency manager — the existing membership policies; a member never edits
  their own membership.
- `member_can` is deny-by-default; unknown keys are false.
- Every permission change is one audited function call with previous and new
  value (rule 10). Role access already is.

## 4. Order
1. Migration: `permission_keys` (seeded), `role_permissions` (platform
   defaults per role), `member_permissions`, `member_can()`, `invite_team_member()`,
   `accept_invitation()`, policies, audit; matrix phase.
2. Team Members page grows the module tree and Copy Permission; policies for
   the first security-relevant keys switch from role checks to `member_can`.
3. `send-invitation` Edge Function; sign-up accepts a token from the link.

## 5. Decisions for Dee
- Which roles are the "Admin / User" pair in the dropdown's plain language:
  keep the 15 specific roles (recommended — they drive department routing) with
  Admin and Manager at the top, or collapse to GHL's two.
- Whether members may hold more than one organization role (today: one).
