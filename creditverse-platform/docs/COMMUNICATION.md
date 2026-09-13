# Communication

One conversation space, shared by BES and Partners. GHL-style: one place where a
BES agent sees everything they need to support a partner and the team.

## ONE RECORD PER CONVERSATION — even DMs and portal messages

Not a copy per view. Not a mirror kept in step. **One `channels` row**, appearing
wherever the people in it are entitled to see it. An agent answering a partner
from the BES Communication screen writes into the same channel the partner reads
in their portal, because there is only one conversation.

The UI enforces the same thing: `ConversationPane` is used by **both** the BES
screen and the Partner Portal. Two copies of a message list is how one exchange
comes to look like two different exchanges depending on who is reading it.

## Tables

```
channels ─┬─ channel_members     (+ is_manager, last_read_at)
          ├─ channel_teams       (narrowing by team)
          ├─ channel_shares      (the ONLY BES route into an organization channel)
          ├─ channel_reads       (per-person unread state)
          └─ messages ─┬─ message_reactions
                       ├─ message_pins
                       └─ message_revisions
```

`messages` is **soft-deleted only**. A conversation whose engagement has ended is
not rewritten — historical BES participation stays attributable.

## Three owners, exactly one per channel

```
organization_id    a customer's own channel — BES reaches it ONLY through a live share
agency_id          BES's own team channel
partner_group_id   a conversation with a BES Partner
```

The constraint is `exactly one`. "Belongs to two things" is how a row ends up
visible to somebody neither would have allowed.

`channel_shares` points at an **engagement**, not an agency or a person, so BES's
access to an organization channel ends when the engagement does — no revocation
job, nothing to forget.

## Partner conversations

**Topic channels** — four standing conversations per partner, keyed by
`channels.partner_topic`:

| Topic | Offered when |
|---|---|
| `general` | always |
| `creditops` | the partner has a live CreditOps engagement |
| `marketing` | the partner has a live marketing engagement |
| `support` | always |

Relevance is decided in `src/lib/portal/portal-conversations.ts` — a **product**
judgement, tested, and deliberately not in SQL. The database decides *who may
talk to whom*; which topics are worth offering is a different kind of question,
and getting it wrong produces an untidy menu rather than a leak.

**A conversation that already exists is never hidden.** A partner whose
marketing engagement ended last month keeps the marketing conversation and
everything said in it.

**`partner_topic` is the find-or-create key, not the channel name.** An
administrator renaming "Support" must not cause the next portal visit to open a
second one. Both sides call `partner_topic_channel(group, topic)` — the BES
"Conversation" button and the portal alike.

**Service-scoped channels** (`partner_service_id`) narrow a conversation to one
engagement; `channel_service_ok()` then admits only staff assigned account-wide
or to that same service.

## Direct messages

`partner_direct_channel(group, other)` — find-or-create, exactly two members,
`open_to_scope = false`.

- **From the partner's side**, the other person must have a **live named
  assignment** to the account. Not any BES employee, and not an ended one.
- **From BES's side**, the other person must be an **active contact** of that
  partner.

**A partner DM is the exception to "every active contact reads their partner's
channels."** `channel_visible()` adds a membership requirement for
`kind = 'direct'` on a partner channel, so a contact writing privately to their
processor is not writing to their colleagues. Proven live, as a real second
contact of the same partner, in `partner-messages-probe.mjs`.

Internal BES DMs use `open_direct_channel(other)` and require both people to be
active staff of the same agency.

**Direct messages are excluded from administrative audit** (`channel_auditable`
skips `kind = 'direct'`). Administration is not participation; if DM audit is
ever wanted it is one line and a deliberate decision.

## `visible_channels()`

**The single most shared function in this module.** One call returns the entire
left rail — every conversation the caller may reach, with unread counts, in one
request rather than one per channel.

**It is read by BOTH the BES Communication screen and the Partner Portal's
Messages page.** Change it and you change both. It has been altered twice
(0335 added `partner_topic`, 0336 added `direct_user_id`), and because it
`returns table`, each change required dropping and recreating it.

It is **SECURITY INVOKER on purpose** — `channels_select` remains the only
answer to who may see what. A definer here would be a second, parallel answer,
and the second answer is always the one that is wrong.

It derives per caller:

- `display_name` — a DM has no name right for both people, so each side is shown
  the other
- `direct_user_id` — **who** the DM is with, by id. Pair on this, never on the
  display name (rule 4: never infer a relationship from a name)
- `unread` — messages after the caller's `channel_reads.last_read_at`
- `audit_only` — readable for administration but not a conversation this person
  is in; grouped separately and never counted as unread

## Threads, mentions, reactions, attachments

- **Threads** reuse `messages.parent_message_id`; a trigger keeps them **flat**
  (a reply to a reply is refused). The UI opens them in a **right-side drawer**.
  `thread_messages()` is SECURITY INVOKER over `messages`, so a thread cannot be
  reachable when its channel is not.
- **Mentions**: `channel_mentionable()` is the **set form** of
  `channel_notifiable()` — the same predicate asked twice, so the picker cannot
  offer somebody the ping will skip. It may name fewer people than
  `channel_visible` admits, never more.
- **Reactions**, **pins** (manager-gated) and **attachments** all come back with
  the message list, so opening a conversation is one call.
- **Realtime** delivers other people's messages without a refresh; an optimistic
  local row is recognised rather than duplicated.
- **Typing presence** is ephemeral, on the socket, never in Postgres.

## Announcements

`announcements` surface **inside** Communication rather than in a separate
inbox, with a partner audience where applicable.

## Verification

```bash
node supabase/scripts/partner-messages-probe.mjs    # 14 live checks
```
