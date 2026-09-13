# Security

## Posture

| | |
|---|---|
| Tables with RLS | **211 of 212** (the exception is documented in `docs/DATABASE.md`) |
| Policies | 475 |
| `SECURITY DEFINER` functions | 422 — **all** pin `search_path`, verified by `npm run probe:sql` |
| Functions reachable by `anon` | 3, all deliberate token flows (`docs/AUTHORIZATION.md`) |
| Secrets in the repository | **none found** — see the audit below |

## Principles

1. **Never rely on hidden UI for security.** Navigation visibility and actual
   data authorization must agree, and the data layer is the one that decides.
2. **Default to deny** when role, scope, tenant, assignment or entitlement is
   unclear.
3. **Never expose** secrets, passwords, tokens, keys or SSNs in logs, error
   messages or frontend code.
4. **A function has two doors** — `anon` and `PUBLIC`. Revoke both.
5. **Historical attribution does not change** when assignments change.

## Sensitive data

Two vaults, both encrypted at rest, both with the same discipline: **masked by
default, revealed through an explicit action, every reveal audited, capability
controlled.**

| Vault | Holds | Reveal | Audit |
|---|---|---|---|
| `client_secrets` | client credentials, SSNs | definer function, capability-gated | `client_secret_events` |
| `partner_credentials` | partner system logins | definer function, capability-gated | `partner_credential_events` |

Rules that are not negotiable:

- **Never send a protected payload to an unauthorized user and hide it with
  CSS.** The reveal is a separate authorized call, not a client-side filter.
- **Never stage SSNs or passwords in temporary files.** Fetch in memory, write
  directly to the secure functions.
- **Never put credentials into migrations, source, logs, notes or seed data.**
- **Never create passwords, temporary passwords or auth users through SQL.**
- **Never store a raw card number, CVV, PayPal password or Wise password.**
  Anywhere. See `docs/BILLING.md`.

## Files and storage

One bucket, `bes-files`, private. Objects are reachable only through signed URLs
minted by a caller the storage policy allows. A file row carries
`shared_with_partner`; **filing a document against a partner does not share it**
— sharing is a deliberate act (`set_partner_file_shared`), and an unshared file
does not appear in the portal at all. It is not a hidden row; it never arrives.

Document previews render inside `<iframe sandbox="">` with `pointer-events`
off, so a stored PDF can neither script anything nor steal a click.

## Repository hygiene audit — 2026-09-13

Scanned tracked files for committed secrets, credentials and artifacts.
**Nothing was rotated, deleted or changed.** Findings:

| Check | Result |
|---|---|
| Committed `.env` files | **None.** `.env*` is git-ignored; only `.env.example` is tracked, and it contains placeholders |
| API keys, tokens, private keys | **None.** Scanned for `sk_live`/`sk_test`, AWS/Google key shapes, JWTs, PEM private keys, Slack `xox*`, GitHub `ghp_*` |
| Service-role key in frontend | **Absent**, and `.env.example` says explicitly never to put it there |
| Debug / scratch / generated artifacts | **None tracked** — no `.log`, `.tmp`, `.bak`, `dist/`, `coverage/`, `.DS_Store` |
| Files matching "credential"/"secret" | All are **source code** for the two vaults, not secret values |
| Largest tracked files | `rls-matrix.mjs` (728 KB), `database.types.ts` (597 KB), `package-lock.json`, `BUILD_STATUS.md` (290 KB), brand images. All legitimate |

**Nothing requires rotation on the evidence in the repository.** Whether keys
held in Supabase, Vercel and provider dashboards should be rotated at handoff is
an operational decision for Dee — see `docs/ACCESS-CHECKLIST.md`.

Two observations, neither a defect:

- `BUILD_STATUS.md` (290 KB), `AUTHORIZATION_MAP.md` (264 KB) and
  `COMPLETION_REGISTER.md` (164 KB) are build-history documents. They are
  accurate but large; a new engineer should read `docs/` first and treat those
  as archives.
- `supabase/scripts/apply-all.sql` (56 KB) is a concatenation helper. The
  canonical history is `supabase/migrations/`; do not apply that file.

## Incident-driven defences

Every one of these exists because something got through. Details in
`docs/KNOWN-ISSUES.md`.

| Defence | Catches |
|---|---|
| `npm run probe:shapes` | ambiguous / invalid PostgREST embeds |
| `npm run probe:sql` | RPC overloads, wrong arguments, missing or excessive grants, unpinned `search_path`, dead cron targets, three-part `net.` names |
| `money-boundary-probe.mjs` | a non-owner reaching partner money |
| `partner-messages-probe.mjs` | a partner's other contacts reading a direct message |
| `rls-matrix.mjs` | the full policy matrix, 70 phases |
| `activity_events` has no delete policy | history being rewritten |
| `owner_delete_record` | anybody but the owner hard-deleting |

## Reporting

If you find a live exposure: fix the **smallest canonical cause**, add a probe
assertion that would have caught it, record it in `docs/KNOWN-ISSUES.md` and
`PILOT_ISSUES.md`, and tell Dee plainly. Do not bundle unrelated work into a
security fix.
