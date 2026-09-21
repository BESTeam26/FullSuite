# Desktop / browser push notifications — Dee's brief (2026-09-21, verbatim)

Mockup: `desktop-notifications-mockup-2026-09-21.webp`. Recorded on receipt; the
words below are Dee's, unedited.

---

You can add this to FullSuite, and I would treat it as a real desktop/browser push notification system, not just an in-app bell.
What you want is:
FullSuite event → browser push notification → native computer notification
So even if FullSuite is minimized or another tab is open, the user can get something like:
🔵 Roniel reacted to your message
BES • Updates & Announcements
"The App will refresh a lot as we keep making changes…"
For your app, I'd build it in three layers.
First, keep your current in-app notifications. Those are still the source of truth inside FullSuite.
Second, add Web Push Notifications using a service worker. The browser asks the user once:
Allow FullSuite to send notifications?
If they approve, FullSuite stores that browser/device push subscription for that user.
Then when an event happens, such as:

* direct message
* mention
* reaction
* task assigned
* task overdue
* leave request decision
* QA feedback released
* invoice/payment alert
* announcement
* urgent escalation

the backend sends a push to that user's registered devices.
Third, clicking the notification should deep-link directly into the correct screen.
Example:
Roniel reacted to your message
Click → opens Communication → Updates & Announcements → exact message
Or:
New QA review assigned
Click → opens CreditOps → QA Review → client/file
Or:
Time Off request from Julius
Click → opens People & Teams → Time Off → Julius's request
I would give Claude this:
Build native browser/desktop push notifications for FullSuite.
Keep the existing in-app notification system as the canonical notification record.
Add Web Push as a delivery channel.
Architecture:

```text
Domain Event
→ canonical notification record
→ notification preference check
→ push delivery
→ browser/service worker
→ native OS notification
```

Do not make browser push the source of truth.
REQUIRED COMPONENTS

1. Service worker for push events
2. Browser Push API subscription
3. VAPID-based server authentication
4. Per-user/device push subscription table
5. Notification preferences
6. Deep links
7. Delivery failure handling
8. Subscription cleanup

DEVICE SUBSCRIPTIONS
One user may have multiple devices/browsers.
Store:

* user_id
* endpoint
* p256dh
* auth key
* browser/device metadata
* created_at
* last_seen_at
* revoked_at

Never store push subscriptions in frontend-only state.
PERMISSION UX
Do not immediately prompt every user on first page load.
Show a FullSuite-controlled prompt first:
`Enable desktop notifications?`
Explain:
`Get notified about mentions, messages, assignments and important updates even when FullSuite is in the background.`
Buttons:
`[Not now] [Enable notifications]`
Only after the user clicks Enable should the browser permission dialog appear.
NOTIFICATION TYPES
Initial launch set:

* direct_message
* mention
* reaction
* announcement
* task_assigned
* task_due
* task_overdue
* leave_request
* leave_decision
* qa_feedback
* escalation

Add finance/payroll notifications later with stricter privacy handling.
PRIVACY
Push content must respect the same authorization and privacy rules as the app.
Do not expose sensitive content on the lock screen by default.
For sensitive notification types, use generic copy:
`You have a new payroll update`
not:
`Your pay is ₱18,200`
Do not include confidential Partner/client details unless the notification type is explicitly allowed to do so.
CLICK ACTION
Every notification should include a canonical deep link.
Examples:

```text
/app/communication/channel/{id}?message={message_id}
/app/talentops/task/{task_id}
/app/people/time-off/{request_id}
/app/creditops/client/{client_id}
```

Clicking the native notification:

* focuses an existing FullSuite tab if one exists
* otherwise opens a new FullSuite tab
* navigates to the exact record

DUPLICATION
Do not send duplicate native notifications to the same device for the same canonical notification event.
Use:
`notification_id + subscription_id`
as idempotency boundary.
REALTIME VS PUSH
If FullSuite is open and focused:
show the in-app realtime notification.
Native push may be suppressed for lower-priority events to avoid double alerts.
If FullSuite is backgrounded/closed:
native push should deliver.
USER PREFERENCES
Add:
Settings → Notifications
Categories:

* Messages
* Mentions
* Reactions
* Tasks
* Announcements
* Time Off
* QA / Performance
* Escalations

Per category:
`In App`
`Desktop/Browser`
`Email later`
Allow:
`Mute channel`
`Mute partner`
`Mute direct message`
Critical admin alerts may have limited muting according to capability/policy.
QUIET HOURS
Add optional quiet hours:
`Do not send desktop notifications from 10 PM to 7 AM`
Store in user timezone.
Mentions/urgent alerts may be optionally allowed through.
COST CONTROL
Do not use polling.
Trigger pushes from existing events.
Push delivery must be event-driven.
Batch non-urgent events where appropriate.
Expired/invalid browser subscriptions must be automatically deactivated when the push provider returns gone/invalid.
Cost scales with:
`number of notification delivery events × active device subscriptions`
No new realtime polling loops.
SECURITY
VAPID private key stays server-side only.
Never expose service-role credentials in the browser.
Validate the canonical notification and recipient before sending.
A user must never receive push content for a record they no longer have access to.
ROLE / SCOPE
Agent:
only own authorized events.
Team Lead:
team events where applicable.
Department Manager:
department scope.
Division Manager:
division scope.
CEO/COO:
organization-wide operational notifications according to preference/capability.
ACCEPTANCE TESTS

1. User enables push
2. Subscription stored
3. Mention sends native notification
4. Reaction sends native notification
5. Direct message sends native notification
6. Task assignment sends native notification
7. Clicking notification opens exact record
8. Background/closed app still receives push
9. Focused app does not create noisy duplicate alerts
10. Revoked browser permission stops delivery
11. Invalid subscription gets cleaned up
12. User cannot receive out-of-scope records
13. Muted channel does not send push
14. Quiet hours respected
15. Multiple devices receive according to active subscriptions

Test Chrome and Edge first.
Then test Safari on macOS separately because Web Push behavior and permission UX differ.
Do not call this closed until actual OS-level notifications are verified on at least one Windows/Chrome and one macOS browser.
For the UI, I'd add one small indicator in Settings:
Desktop Notifications
This device: Enabled ✓
Chrome on MacBook Pro
Last seen: Today
`[Send Test Notification]`
`[Disable on this device]`
And I'd absolutely include a Send Test Notification button. That will save you a lot of debugging.
One more important point: if your team mainly uses FullSuite in Chrome/Edge on desktops, this feature is very practical. If you later want true mobile push with a native app/PWA behavior, that's a separate layer, but you do not need to wait for that to get desktop/browser notifications working now.

I wanna make sure we just use the most effective behavior for Computer notification just like slack and MS Teams
