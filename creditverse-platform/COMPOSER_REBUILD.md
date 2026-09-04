# Comment / internal-note composer — rebuild

**Applied and verified end-to-end.** Migration `20260903002000` is live;
`migration list` reports 24 local, 24 remote, nothing pending.

---

## What was wrong

| | |
|---|---|
| The composer was a Markdown textarea | Users had to type `#`, `>`, ` ``` ` and the placeholder advertised them |
| Formatting was disconnected from the writing area | Buttons inserted syntax rather than formatting the selection |
| **Attachments never persisted at all** | They were `URL.createObjectURL()` blobs JSON-encoded into the note text as `\n__ATTACHMENTS__:[…]`. A blob URL dies with the page — refresh and every attachment was a broken link. Nothing was ever uploaded anywhere |
| No storage integration | The private `bes-files` bucket and `public.files` table existed and were unused by notes |

## What it is now

One canonical `ActivityComposer` — the only comment editor in the codebase.
Context comes in as props (`entityType`, `entityId`, `organizationId`,
`allowedVisibilities`, `onPost`, `onAttach`), so CreditOps, FundingOps, the deal
workspace and the Custom Workspace / TalentOps / BES CRM surfaces still to come
all use the same one (rule 2).

**Editor** — TipTap 3 (ProseMirror). Bold, italic, underline, strikethrough,
heading, bulleted / numbered / checklist, quote, code block, link, undo, redo.
The toolbar formats the selection in place and lights up to show active marks.
No Markdown is typed or shown.

**Attachments** — paste, drag-and-drop, or the paperclip. Uploaded to the
existing private bucket while you keep writing, with per-file thumbnail,
progress, remove and retry.

## The security model

**Rich text is not stored as HTML.** The note is a structured document
(`activity_events.body`, jsonb) rendered node by node into React elements.
Nothing is ever passed to `dangerouslySetInnerHTML`, so there is no HTML parse
step to attack and no sanitizer to keep ahead of — an unknown node renders as
nothing and an unknown mark is dropped. Link hrefs are the one raw string that
carries power, so they are allow-listed to `http`, `https`, `mailto`, `tel`
both on the way in (TipTap `protocols`) and on the way out (`safeUrl`).
`javascript:` and `data:text/html` are refused at both ends.

**An attachment is readable exactly when its note is readable.** This needed an
RLS change, and it is the one genuine correctness reason in this task:

> `files_select` was `is_staff_of(agency_id) or is_org_member(organization_id)`
> — it knows nothing about activity visibility. Attach a screenshot to a
> **BES-internal** note on a customer's client and any member of that
> organization could have fetched it, even though the note itself is invisible
> to them. That is precisely the "reached through another route" leak.

The rule is now stated once and deferred to twice:

```
storage.objects (…/activity/…)  →  the files row
public.files (entity_type = 'activity_event')  →  the activity_events row
activity_events  →  can_view_activity(...)   ← the existing, unchanged rule
```

Because a policy subquery runs under the caller's own RLS, *asking whether the
parent note is visible* **is** the visibility check. No copy of
`can_view_activity` was made, so nothing can drift out of step with it.

Supporting details: BES-internal attachments are filed under `agency/` rather
than the customer's folder, so the tenancy layer agrees with the visibility
layer; the bucket stays private and reads go through short-lived signed URLs
(signing is itself RLS-checked, so no link can be obtained for a note you
cannot read); stored filenames are generated UUIDs, never the user's string;
uploads are allow-listed by MIME type and capped at 10 MB.

## Persistence

```
compose → format → paste/upload → choose audience → Post
  → one activity_events row (body + plain-text detail)
  → one files row per attachment, in a single insert
  → the persisted row is placed into the timeline cache
```

No refetch of the client list. No timeout. `detail` keeps the plain-text
rendition, so search, system events and every note written before this keep
working — the timeline falls back to plain text whenever `body` is absent.

## Performance

The editor is behind `React.lazy`, in its own **390 KB (124 KB gzipped)** chunk.
The main bundle is **624 KB / 187 KB gzipped — unchanged**, so screens without a
composer pay nothing. Timeline attachments load in **two requests for the whole
timeline** (one query for the rows, one batched call to sign every URL), never
one per note.

Also fixed while here: a duplicate-React "Invalid hook call" that appeared the
moment the lazy chunk loaded. Vite had not seen TipTap at startup, so it
re-optimized mid-session and briefly ran two React copies. `resolve.dedupe` plus
`optimizeDeps.include` settles it; the production split is unaffected.

And Supabase rejects with a `PostgrestError`, not an `Error`, so every failure
had been collapsing to a generic "Could not post this note". `errorMessage()`
now surfaces the database's own wording — which is how the missing-column
message above became visible at all.

## Verified

| | |
|---|---|
| Editor mounts, 12 controls present, no Markdown placeholder | ✅ |
| Bold applies to the selection; toolbar shows the active state | ✅ `<strong>` in the document |
| Checklist produces a real task list | ✅ |
| Post disabled with no text and no attachment | ✅ |
| Double-click / Ctrl+Enter twice posts once | ✅ pinned by test |
| Write failure keeps the note, restores the button, shows the reason | ✅ real message surfaced |
| Contrast, light **and** dark | ✅ toolbar 6.30:1 light / 6.57:1 dark active; editor text 18.75:1 |
| Mobile 375×812 | ✅ no horizontal overflow, toolbar wraps, Post reachable |
| Typecheck · 211 tests · lint (0 errors) · build · no circular deps · live security | ✅ |

## End-to-end verification (all passed)

| # | Check | Result |
|---|---|---|
| 1 | Post a rich-text note | ✅ bold + checklist, typed with real keyboard input |
| 2 | Formatting persists after refresh | ✅ `<strong>` and the checkbox both re-render; no raw Markdown |
| 3 | Paste an image into the composer | ✅ `ClipboardEvent` with a real PNG |
| 4 | Thumbnail before posting | ✅ blob preview + size, upload finished while composing |
| 5 | Image uploads to Storage | ✅ `storage.objects` 7352 bytes, matching `files.size_bytes` |
| 6 | Image still displays after refresh | ✅ served from a **signed** URL, loaded at its true 240×120 |
| 7 | PDF persists and opens in-app | ✅ existing FileViewer, signed URL, `#view=FitH` preserved |
| 8 | Org users cannot reach BES-internal attachments | ✅ see below |
| 9 | Unauthorized BES users cannot reach org-internal attachments | ✅ see below |
| 10 | Shared / Client-Visible follow the activity model | ✅ see below |
| 11 | Direct Storage / `files` access denied | ✅ see below |
| 12 | Triple-click posts once | ✅ **one** `activity_events` row in the database |
| 13 | Post performance with an attachment | ✅ note on screen at ~285ms; 4 calls / 897ms total |
| 14 | Tests · typecheck · lint · build · live security | ✅ 211 tests, 0 lint errors, no circular deps |

### The access matrix, measured

Tested by impersonating each user's JWT inside a rolled-back transaction, so
Postgres evaluated the real policies — no passwords, no UI, nothing mocked.

| Note / attachment | BES owner | Lakeside org admin | Northgate (unrelated) |
|---|---|---|---|
| `bes_internal` (real .png + .pdf uploads) | ✅ | **❌** | ❌ |
| `organization_internal` — Lakeside *(engaged)* | ✅ | ✅ | ❌ |
| `shared_with_partner` — Lakeside | ✅ | ✅ | ❌ |
| `client_visible` — Lakeside | ✅ | ✅ | ❌ |
| `organization_internal` — Ironwood *(**no** BES engagement)* | **❌** | n/a | ❌ |

The same matrix held at all three layers independently — the note row, the
`files` row queried directly, and `storage.objects` queried directly. **The
attachment was readable exactly when its note was, in every cell.**

Two cells carry the weight. Lakeside's admin cannot read the BES-internal
attachment even by querying `files` and `storage.objects` directly, which is
the "another route" leak this migration existed to close. And BES staff cannot
read Ironwood's organization-internal material, because Ironwood has no
fulfillment engagement — staff status is not access (rule 16).

It is not blanket denial: Lakeside's admin reads 3 of the 5 objects. Both the
positive and negative cases are proven.

## Known residue

- Four synthetic `storage.objects` rows from the access-matrix fixtures remain
  (`.../activity/fulfillment_client/sec-1*.png`). Their `files` rows are
  deleted, so the storage policy makes them **readable by nobody**, and they
  contain no bytes. Supabase blocks direct deletes from storage tables (a good
  guard), and they are owned by `bes.owner@bes.test`, so they need the Storage
  API or the dashboard to clear. Harmless; listed so they are not a mystery.
- Posting a **text-only** note still costs two background requests (re-read and
  re-sign the timeline's attachments), because the attachment query is keyed on
  the list of visible note ids and that list just changed. Non-blocking — the
  note itself renders at ~285ms — and correct, since expiry means signed URLs
  must be re-minted anyway. Recorded rather than over-engineered.
