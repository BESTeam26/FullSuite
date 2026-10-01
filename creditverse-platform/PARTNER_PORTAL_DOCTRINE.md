# Partner Portal doctrine (Dee, 2026-10-01 — verbatim)

Supplied by Dee in chat on 2026-10-01 with a screenshot of the portal
Overview. Recorded unchanged. The closing offer at the end is the author's
and is not an instruction.

---

Yes. I’d treat the Partner Portal as a separate product experience from the internal BES workspace.
From your screenshot, the foundation is already good: the portal is clean, simple, and clearly partner-facing. The main risk now is letting it become too much like the internal app.
For the Partner Portal, I’d lock the goal as:
“Give the Partner everything they need to understand their account, communicate with BES, review clients/work, take action, and see what is happening without exposing internal operations.”
Your current navigation is:

* Overview
* Clients
* Projects & Services
* Actions Needed
* Messages
* Billing
* Files
* Updates
* Account Settings

That is actually a strong base. I would keep it.
What I would change first is the hierarchy and what each page is responsible for.
Overview should become the Partner’s command center. It should show only what matters to them:

* Active services
* Active clients
* Items needing their action
* Important updates
* Upcoming billing
* Recent messages
* Current project/build status
* Account manager / BES contact

Clients should be their clean client-facing directory, not the full CreditOps workspace. They should be able to see:

* Client
* Current status
* Round/stage
* Last update
* Next step
* Action needed from Partner
* Completed/Archived

They should NOT see:

* internal processor notes
* internal team assignments unless intentionally exposed
* internal SLA logic
* QA notes
* private staff comments
* internal automation/status mechanics

Projects & Services should show what BES is doing for them:

* CreditOps
* BES CRM
* TalentOps
* FundingOps
* any builds/projects
* start date
* progress
* milestones
* deliverables
* approvals needed

Actions Needed is important and should be one of the strongest pages. This is where you reduce back-and-forth. It should contain:

* Missing documents
* Client confirmation needed
* Approval needed
* Monitoring login needed
* Billing action
* Agreement/signature required
* Project approval
* Information request

Messages, from your screenshot, is already heading in the right direction. I would keep the Slack-style structure, but simplify it for Partners.
I would use:

* General
* Support
* Projects
* Billing
* Direct messages to assigned BES contacts

I would not expose internal channels or internal team chatter.
For the screen you showed specifically, I would make these improvements:

* Keep the left Portal sidebar exactly as the Partner navigation.
* Keep channel list + message panel.
* Make the right “Channel details” panel collapsible and closed by default on smaller widths.
* Show unread counts on channels.
* Show a clear badge when a message is from BES staff vs Partner.
* Add pinned action links inside the channel header if relevant, such as:
   * View Client
   * View Project
   * View Invoice
   * Upload File
* Keep partner-visible messages isolated from internal comments.
* Make sure @mentions only include people the Partner is allowed to interact with.
* Do not expose the entire BES staff directory.

Billing should be simple:

* Open invoices
* Paid invoices
* Payment method
* AutoPay status
* Receipts
* Billing contact
* Past due notice

Files should be shared files only:

* Partner uploads
* BES shared docs
* Agreements
* Deliverables
* Reports
* Client-related shared documents

Updates should be the clean external activity feed:

* project update
* service milestone
* client status update
* completed deliverable
* billing update
* account update

Not raw system logs.
Account Settings:

* Business info
* Contacts
* Notification preferences
* Password/security
* Portal users
* maybe brand/business details

The most important architecture rule I’d give Claude is:
Partner Portal is a filtered external projection of the same canonical BES data.
Do not create duplicate Partner data, duplicate client records, duplicate billing records, or duplicate project records just for the portal.
The portal reads the same canonical data through partner-safe views and permissions.
Internal-only fields stay internal.
Partner-visible fields are explicitly exposed.
And for security:
The Partner Portal must never rely on hidden UI alone.
Every portal query, RPC, file, message, invoice, client, and project must be tenant-scoped and enforced server-side.
A Partner must never be able to change an ID in the URL or API call and see another Partner’s data.
I’d work on this in this order:

1. Partner Overview
2. Clients
3. Actions Needed
4. Messages
5. Projects & Services
6. Billing
7. Files
8. Updates
9. Account Settings

And I would keep the portal noticeably simpler than the internal FullSuite.
If you want, I can do the next step as either:

* show you the Partner Overview UI, or
* give you the exact simple Claude instruction to start cleaning the Partner Portal.
