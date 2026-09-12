## D-011 · Sales & Marketing — import the calendar and campaigns from a spreadsheet

**Option A SHIPPED 2026-09-13** — paste/CSV import, on the Tasks and Content
Calendar views. Option B (live Google Sheets sync) remains open and still
needs Dee to decide on adding Google to the locked stack, plus credentials.
The shared design below is what Option A already implements, so a later sync
reuses the upsert key, the column mapping and the preview rather than
replacing them.

**Dee, 2026-09-13:** *"we use to generate campaign via GPT, manually uploading
this info here is chaotic and waste of time, let's have an automatic import or
update of calendar and campaign details from a google spreadsheet or tracker."*

**The real problem is data entry, not integration.** A month of content is
planned in one go and then typed in one row at a time. Both options below fix
that; they differ in what they cost and what they need from Dee.

**Option A — paste / CSV import (no new stack, buildable inside the existing
architecture).** Export the sheet, paste it in, preview what will be created
or updated, confirm. Writes canonical `work_items` + `campaigns`, the same as
every other path into the engine. Nothing new in the stack (rule 19), no
Google account, no credentials. Re-pasting an edited sheet UPDATES rather than
duplicating, on a stable key. This is the ClickUp importer's shape, which
already exists in the repo and works.

**Option B — live Google Sheets sync.** A Google service account or OAuth app,
a sheet id recorded per workspace, a scheduled pull, and conflict rules for a
row edited on both sides. Google Sheets is **not in the locked stack** (rule
19), so adding it is Dee's decision, not an implementation detail — and it
needs credentials that do not exist yet.

**Shared design, either way**

| Piece | Note |
|---|---|
| Upsert key | A stable `external_ref` on `work_items`, unique per workspace. Without it, a second import duplicates a month of content. Row number is NOT stable — people insert rows |
| What a row becomes | One `work_item` in the partner's (or BES's) marketing workspace. NOT a new content table — one record, three views stays the rule |
| Columns | title, publish date, channel, content type, caption, campaign, assignee, status, due date. Publish date and channel are `workspace_fields` rows already |
| Campaigns | A campaign named in a row is created if missing, reused if not. Never a second campaign with the same name in one workspace |
| Unmapped columns | Surfaced and skipped, never guessed. A column nobody mapped must not silently become the caption |
| Preview before write | Created / updated / skipped counts and the first rows, exactly like the ClickUp import. Dee confirms; the importer does not decide |
| Deletion | A row removed from the sheet does NOT delete the task. Work in progress is not the sheet's to revoke (rule 11) |
| Authorization | `marketing.tasks.manage`, and the workspace must be one the importer may already write to. The importer is not a way past RLS |

**Do not** create a marketing content table to stage the import. **Do not**
let an import overwrite a status somebody moved by hand without saying so in
the preview. **Do not** add Google to the stack without Dee deciding it.


## D-010 · Agency Calendar — Google Calendar integration (documented, not started)

**Dee, 2026-09-12:** *"I want my calendar be more interactive, connect to
google calendar capabilities, and be more colorful than a plain boring
calendar. Each agents can have their own calendar connect via google, company
wide event will show on their calendar, and their google meetings will be
showing here as well."*

**Deferred because it is an integration epic, not a UI change.** The colourful,
interactive part is a day's work. The rest is a Google OAuth app with
per-user consent, refresh-token storage for every agent, incremental sync
with `syncToken`, webhook channels that expire and must be renewed, and a
two-way write path if events created here should appear in Google. That is
its own architecture review (rule 20), and the CreditOps consolidation is the
active epic.

**Scope when it starts**

| Piece | Note |
|---|---|
| Google OAuth per agent | `calendar.readonly` at minimum; `calendar.events` only if BES writes back. Consent is each person's own — never one service account reading everybody's calendar |
| Token storage | Refresh tokens are credentials. They belong in the Vault beside the client secrets, not in a plain column, with reveal audited |
| Sync | Incremental (`syncToken`), plus `watch` channels renewed before expiry. A full re-list per poll does not scale and hits quota |
| Company events | The existing `calendar_events` / announcements records stay canonical and are overlaid on each agent's view — never copied into their Google calendar unless they ask |
| Google Meet | The `hangoutLink` / `conferenceData` on the event, shown as a join control |
| Colour | Per source (BES company, my Google, department, client work) rather than per event, so the legend means something |
| Authorization | An agent sees their own calendar and company events. A lead seeing a team member's calendar is a separate capability, not implied by rank |

**Do not** build a second calendar engine: `calendar_events` is canonical, and
Google is a SOURCE overlaid on it. **Do not** store anyone's Google tokens
outside the Vault. **Do not** ship a version that silently shows nothing when
a token expires — say it is disconnected and offer to reconnect.
