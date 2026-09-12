
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
