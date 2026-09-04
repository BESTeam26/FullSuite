# Comment / internal-note composer — rebuild

**One step is outstanding and only you can run it: apply the migration.**
Until then, posting a note fails with *"Could not find the 'body' column"*.
Everything else below is built, tested and verified.

```bash
npx supabase db push
```

(or paste `supabase/migrations/20260903002000_activity_rich_notes_and_attachments.sql`
into the Supabase SQL editor). I have no database password here — only the
browser's anon key — so I could not apply it myself.

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

## Not verified, because it needs the migration

Attachment upload, attachment persistence across refresh, rich-text persistence
across refresh, and the cross-audience attachment check (a user who cannot read
the note cannot fetch its file). The code is written and unit-tested; these are
live checks I will run once the migration is applied.
