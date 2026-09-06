# Architecture proposal — mentions everywhere, and company channels

**Status: PROPOSAL. Nothing here is built.** Dee, 2026-09-05: *"I want the
mention capability in comments or chat or post or notes just like Slack or
Google Chat or MS Teams in the entire platform that requires this capability.
Also let's add the communication capability that will serve as Slack internal
communication for the organisation. Now if they subscribe with BES
Fulfillment, BES team will have access to these channels. Analyse and make
this work without conflict."*

Two features, one design, because they share the same three pieces: a text
body, a way to name a person in it, and a rule about who may see the result.

## 1. What exists (FACT)

- **Notes and comments** are `activity_events` rows carrying a structured
  `body` (`NoteDoc`: paragraphs, bold, italic, links) plus a plain-text
  `detail` that keeps search, the timeline and notifications working. The
  editor is `components/composer/RichTextEditor.tsx`.
- **Visibility** is already a first-class field on activity
  (`activity_visibility`), with BES-internal and shared audiences, and
  `can_view_activity()` decides who reads a row.
- **Notifications** exist (`notifications`, kinds `assigned`, `unassigned`,
  `note`, `status`), written by a **trigger on activity**, never by the
  browser.
- **No mention support anywhere**, and no channels.
- BES access to an organization's data already runs through
  `bes_may_fulfil(org, group, service)` + `in_scope()` — a live engagement and
  an authorized team, never staff status (rule 16).

## 2. Mentions

### The shape

A mention is a node in the body, not a string to be re-parsed later:

```json
{ "type": "mention", "attrs": { "userId": "uuid", "label": "Piper Manager" } }
```

The plain `detail` keeps `@Piper Manager`, so search, older rows and the
email digest keep working unchanged — the same additive trick `body` already
uses.

### Who may be mentioned — and who gets told

This is the part that must not be sloppy. Two separate questions:

1. **Who appears in the picker?** Only people the author already shares a
   scope with: `assignable_profiles()` for work, the organization directory
   for organization surfaces, channel members in a channel. No global user
   search, ever — a picker that finds people outside your scope is an
   information leak in itself.
2. **Who actually gets notified?** Decided in the database, not the browser.
   A trigger extracts the mention ids from `body` and inserts a notification
   **only** for recipients who can see that row — the same
   `can_view_activity()` the reader uses. Mentioning someone who cannot see a
   BES-internal note silently notifies nobody; the note still says their name,
   because the author wrote it, but nothing is disclosed to them.

New notification kind: `mention`. New activity action: none — a mention is
part of a note, not an event of its own.

### Where it applies

Every surface that already writes a `NoteDoc`: work item comments, client
timeline notes, funding file notes, dispute notes, announcements, knowledge
articles, and the channel messages below. One editor, one renderer, one rule.

## 3. Company channels ("Messages")

### Shape

| Table | Purpose |
|---|---|
| `channels` | `organization_id`, `name`, `purpose`, `kind` (`open` to every member / `private` to its members), `bes_shared` (see below), `archived_at` |
| `channel_members` | who is in a private channel, and everyone's last-read marker for unread counts |
| `channel_messages` | `channel_id`, `author_id`, `body` (NoteDoc), `detail`, `reply_to_id` (threads), `edited_at`, `deleted_at` |

Deliberately **not** `activity_events`: a channel message is not about a
record, and putting it there would corrupt the timeline that CreditOps and
FundingOps depend on. They share the body model and the mention rule, and
nothing else.

### BES access — the part Dee asked to get right

```
BES sees a channel only when ALL of:
  the channel is marked bes_shared by the organization
  AND a live fulfillment engagement covers that organization
  AND the BES user is inside the engagement's authorized team (in_scope)
```

Consequences, stated plainly:

- **Subscribing to fulfillment does not open the organization's channels.**
  The organization marks a channel shared; the rest stays private. That is
  rule 16's "association is not publication", applied to conversation.
- A channel marked shared shows a permanent, visible label — *"BES can read
  this channel"* — on the channel itself and in its header. Nobody should
  discover after the fact that an outsider was reading.
- When the engagement ends, BES loses the channel the same day, because the
  check is `engagement_is_live`, not a stored grant.
- BES's own internal channels are the mirror image: they live under the
  agency, and no customer ever sees them.

**Recommended default:** a new channel is private to the organization, and
sharing is a deliberate act with a confirmation that names what it does.

### Module and permissions

- A Hub module (`chat`, package **Hub Operations**), so it obeys the three
  layers already in place: entitled → the organization switches it on → the
  person's role allows it (rule 18).
- Two permission keys: `chat.use` (post and read what you may see) and
  `chat.manage` (create channels, archive, change sharing).

### Notification discipline (rule 10)

- A **mention** notifies. A message does not.
- Everything else is an unread count per channel from the last-read marker —
  a number, not a row per message. Anything else would bury the notifications
  that matter (an assignment, an approval waiting).

## 4. Conflicts considered, and how each is avoided

| Possible conflict | How it is avoided |
|---|---|
| Two comment systems drifting apart | One body model, one editor, one mention resolver; only the storage differs, and for a stated reason |
| Channel chatter polluting record timelines | Messages never enter `activity_events`; a message *about* a record links to it instead |
| BES reading private company talk | Per-channel opt-in **and** live engagement **and** authorized team; a visible label on shared channels |
| Mention used to probe who exists | The picker is scope-limited; the notification is decided in the database by the same visibility rule as reading |
| Notification flood | Mentions notify; messages are counted |
| A second permission system | Two keys in the existing catalogue; nothing new |
| Chat becoming a task tracker | No statuses, no assignment, no due dates in channels; "make this work" links to a work item instead |

## 5. Build phases

| Phase | Delivers | Migration | Needs Dee |
|---|---|---|---|
| **A** | Mentions in every existing note surface: node type, scoped picker, renderer, `mention` notification kind, trigger, matrix probes | 0083 | Approval |
| **B** | Channels: tables, RLS, Hub module `chat`, permissions, channel list, messages, unread counts, mentions inside messages | 0084 | Approval |
| **C** | BES sharing: `bes_shared`, the visible label, engagement-scoped policies, matrix probes for every path | 0085 | Confirm the default (private) |
| **D** | Threads, edit and delete windows, file attachments (reusing canonical storage), search | 0086 | — |

## 6. Decisions for Dee

1. **Default for a new channel: private to the organization** (recommended),
   with sharing to BES a deliberate act. Confirm.
2. Should BES staff be able to **post** in a shared channel, or only read?
   (Recommended: post — they are working with the team, and silent readers
   are worse.)
3. Are channels **Hub Operations** (recommended, sold with Grow and above) or
   Hub Core?
4. Direct messages between two people: in scope now, or after channels?
   (Recommended: after — channels first, and direct messages carry their own
   privacy questions for BES access.)
5. Editing and deleting a message: allowed within a window (recommended 15
   minutes, edits marked), or never?
