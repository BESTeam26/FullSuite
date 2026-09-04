# Repository / project location integrity audit

**Read-only. Nothing was moved, deleted, migrated or modified.**

## Answer first

> **Is there any code, migration, configuration, test, documentation, or recent
> BES Platform work outside the canonical repository that we would lose or fail
> to deploy?**

**No.** Everything belongs to one repository and one application directory.
Evidence below.

The audit did surface a separate exposure that had nothing to do with
directories — the repository had no remote, so every commit existed only on one
Mac. **That is now resolved:** `origin` points at
[BESTeam26/FullSuite](https://github.com/BESTeam26/FullSuite), `main` tracks
`origin/main`, and the two are in sync with a clean tree.

---

## Summary

| | |
|---|---|
| **CANONICAL REPO** | `/Users/dee_gallardo/BES-Platform` (wrapper) — one repo containing the app |
| **GIT ROOT** | `/Users/dee_gallardo/BES-Platform` — identical from both directories; exactly one `.git`, no nested repos |
| **ACTIVE BRANCH** | `main` |
| **REMOTE** | `origin` → https://github.com/BESTeam26/FullSuite · `main` tracks `origin/main`, 0 ahead / 0 behind |
| **APP ENTRYPOINT** | `creditverse-platform/` — one `package.json`, one `index.html` → `/src/main.tsx`, one `vite.config.ts` |
| **SUPABASE ROOT** | `creditverse-platform/supabase/` — the only CLI project directory |
| **MIGRATIONS** | 24 on disk = 24 tracked = 24 local = 24 remote · 0 pending · 0 remote-only |
| **UNCOMMITTED WORK** | none — `git status` is empty, including untracked |
| **UNTRACKED IMPORTANT FILES** | none |
| **DUPLICATE / STRANDED CODE** | none |
| **WRONG-LOCATION ARTIFACTS** | none remaining |
| **IGNORED FILE RISKS** | none — only `.env.local`, `dist/`, `node_modules/`, `supabase/.temp/` |

**Structure:** wrapper + application in **one** repository. `BES-Platform` is
not a separate repo and `creditverse-platform` is not nested — the git root is
the wrapper, and the application is a subdirectory of it. That is why a CLI
command run from the wrapper resolved a different (empty) `supabase/`.

---

## 1. Repository root

```
git root (from wrapper)  /Users/dee_gallardo/BES-Platform
git root (from app dir)  /Users/dee_gallardo/BES-Platform
.git directories found   ./.git        (exactly one)
branch                   main  →  origin/main  (0 ahead, 0 behind)
remotes                  origin  https://github.com/BESTeam26/FullSuite
status                   clean, 0 entries including untracked
```

## 2. Source-code duplication

Everything tracked **outside** `creditverse-platform/` — the complete list:

| File | Belongs at root? |
|---|---|
| `CLAUDE.md` | ✅ project rules |
| `.gitignore` | ✅ root ignores |
| `.claude/launch.json` | ✅ dev-server config |
| `Gold Transparent - Logo.png` | ✅ brand asset |

Searched for and found **none** outside the app: `src/`, `app/`,
`components/`, `lib/`, `hooks/`, `pages/`, `public/`, `tests/`, `scripts/`,
`package.json`, `package-lock.json`, `tsconfig*`, `vite.config*`, `.env*`,
Supabase files, SQL, migrations, config or documentation.

Untracked on disk, both correctly ignored: `.DS_Store`, `BES CreditHub.zip`.

### The zip is the original import, not stranded work

`BES CreditHub.zip` (712 KB, dated **1 Sep**) is the original GHL export: 359
files against 484 tracked today. Twenty files sit at paths that no longer
exist; **eighteen are in `src/_archive/`** (the deliberate parking place for
unrouted legacy screens), and the remaining two were removed in named commits:

- `FundingEmailConflictBanner.tsx` — `1fa6d1a` *"Dedupe step 2: shared list
  helpers, email banner and client grid"*
- `lib/dispute/index.ts` — `d345819` *"Cleanup: self-duplication, orphans, dead
  imports"* (barrel removed; the eight modules are imported directly)

Both are recoverable from history. Nothing unique is held in the archive.

## 3. Supabase

One canonical directory. (`src/lib/supabase/` is application client code, not a
CLI project.)

```
config.toml      present, project_id = "creditverse-platform"
migrations/      24 .sql — 24 tracked, 0 ignored
scripts/         verify-live.mjs
seed.sql, seed_creditops.sql
functions/       none
CLI link         wiojlgkzxlaiajwwrzuj
.temp/           git-ignored, 0 files tracked
```

`migration list`: **24 local, 24 remote, 0 pending, 0 remote-only.**

The deleted parent `/supabase/` held nine files, all CLI cache under `.temp/`
(`project-ref`, `pooler-url`, version stamps) — no SQL, no config, no seed, no
functions. Removing it cost nothing, and `/supabase/` is now ignored at the
root so it cannot be recreated and committed.

## 4. Recent work — located, not assumed

Every item found on disk, tracked, with its commit:

| Work | File | Commit |
|---|---|---|
| Fulfillment engagements | `migrations/…001200_fulfillment_engagements.sql` + `lib/data/fulfillment-engagements.ts` | `ce0d2d5` |
| Audit delete protection | `migrations/…000900_protect_history_from_cascade.sql` | `b037069` |
| Audit tamper-proof | `migrations/…000400_activity_events_tamper_proof.sql` | `6d0b6be` |
| Activity visibility | `migrations/…001300_activity_visibility.sql` | `2a2454b` |
| Visibility UI | `fulfillment/VisibilityControls.tsx` | `ac9c53a` |
| Dev test data | `migrations/…001900_dev_test_data.sql` | `e7a85c7` |
| Perf cold-load fixes | `lib/auth/auth-context-bootstrap.test.tsx` | `7cc1c55` |
| Mutation fixes | `composer/activity-composer.test.tsx` | `310624b` |
| Rich-text composer | `composer/ActivityComposer.tsx`, `RichTextEditor.tsx`, `lib/activity/note-body.ts` | `310624b`, `eeb6c71` |
| Persisted attachments | `lib/data/activity-attachments.ts` | `310624b` |
| **Migration 02000** | `migrations/…002000_activity_rich_notes_and_attachments.sql` | `310624b` |
| Composer list/checklist CSS | `styles/rich-text.css` | `eeb6c71` |
| Duplicate-Supabase cleanup | `.gitignore` rule `/supabase/` | `810e038` |
| Notification/count fixes | `auth/RequireAgencyStaff.tsx` | `e195263` |

Documents, all tracked: `PERFORMANCE_DIAGNOSTIC.md`, `MUTATION_DIAGNOSTIC.md`,
`NOTIFICATIONS_DIAGNOSTIC.md`, `COMPOSER_REBUILD.md`, `DEV_TEST_DATA.md`,
`STAGING_TEST_COVERAGE.md`, `ARCHITECTURE_PROPOSAL_WORKSPACES.md`,
`ARCHITECTURE_PROPOSAL_TEAM_SCOPE.md`, `BUILD_STATUS.md`.

## 5. Git integrity

- Nested `.git` directories: **none**
- Untracked non-ignored files: **none**
- Ignored paths, complete list: `.env.local`, `dist/`, `node_modules/`,
  `supabase/.temp/` — build output, dependencies, secrets and CLI cache only
- No source file or migration is ignored
- Committed CLI cache: **none** (the nine former root `.temp` files were
  removed from the index in `810e038`)
- Duplicate source trees: none — one `src/`, with `_archive/` inside it by
  design and excluded from the bundle
- Changes outside the git root: none

**Secrets:** `.env.local` is untracked and ignored; `.env.example` is tracked,
which is correct for a template. No values were read or printed.

## 6. Build entrypoint

Exactly one of each, all inside `creditverse-platform/`:

```
package.json      vite_react_shadcn_ts   dev: vite   build: vite build
index.html        <script src="/src/main.tsx">
vite.config.ts
src/main.tsx
```

`.claude/launch.json` runs `npm --prefix creditverse-platform run dev`, so the
dev server's process directory is the wrapper but the **application it serves
is the canonical one**. No second copy is being served.

## 7. Claude working directory

`CLAUDE.md` states it, with the failure mode spelled out so it is not repeated:

> **Always run `supabase` and `npm` commands from `creditverse-platform/`,
> never from the repository root.** … Run it from the repository root and it
> creates a root-level `supabase/.temp` holding link state but **no
> migrations** … That reads exactly like migration drift and invites a
> `supabase migration repair`, which would mark a correct history as reverted.

The README carries the same instruction plus a Database section.

---

## Issues found

1. **✅ No git remote — resolved.** Was the one genuine risk this audit found.
   `origin` is now configured and pushed; the platform exists off this machine.
2. **🟡 `BES CreditHub.zip` (712 KB)** sits untracked in the working tree. It is
   the 1 Sep import and holds nothing unique. Harmless, but it is the artefact
   most likely to be mistaken for a second copy later.
3. **🟢 `.DS_Store`** untracked and ignored at root. Cosmetic.

## Recommended cleanup

No cleanup is required for correctness.

1. ~~Add a remote and push.~~ **Done** — `origin` →
   [BESTeam26/FullSuite](https://github.com/BESTeam26/FullSuite).
2. Move or delete the zip once you are satisfied the archive is not needed.
3. Optionally add `.DS_Store` to the root `.gitignore` (already untracked).

**Nothing should be moved or deleted to make the build, the app or the database
correct — all three already resolve entirely from `creditverse-platform/`.**
