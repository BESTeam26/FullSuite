# New engineer — access checklist

Minimum access for each account. **Grant the minimum first**; raise it when a
task actually needs it. Dee grants each of these personally.

| # | Service | What it is | Minimum access | Notes |
|---|---|---|---|---|
| 1 | **GitHub** | `BESTeam26/FullSuite` | **Write** (not Admin) | Write is enough to branch, PR and merge. Admin is only needed to change settings or secrets — raise it if they take over CI |
| 2 | **Supabase** | project `wiojlgkzxlaiajwwrzuj` | **Developer** to start; **Owner/Admin** once they are the technical lead | Admin is required to set Function secrets, change Auth SMTP and run migrations against production. The service-role key is visible at Admin — treat that as the real escalation |
| 3 | **Vercel** | hosting | **Member** on the project | Enough to see builds, logs and to promote a previous deployment (the rollback path). Owner only if they manage env vars |
| 4 | **Resend** | email | **Member** | Needs to read delivery logs and bounces. The API key already lives in Supabase secrets — they do not need to see it to debug |
| 5 | **Google Cloud** | — | **Only if actually used** | Nothing in the current stack requires it. If a Google Workspace or Drive integration is added later, scope it then. **Do not grant blanket project access now** |
| 6 | **Authorize.Net** | payments | **Read-only / sandbox first** | Sandbox account for development. **No production Merchant Interface access until Dee approves live charging.** The Signature Key for webhooks is generated here and does not exist yet |
| 7 | **GoDaddy / DNS** | `bescrm.net` | **Not by default** | DNS changes affect email deliverability (SPF/DKIM/DMARC) and the live domain. Grant per-task, with Dee present |
| 8 | **GoHighLevel** | sales front end | **Agency-level user** | One agency credential; locations are discovered. Needed to debug the outbound dispatcher |
| 9 | **ClickUp** | historical migration source | **Read-only, and only if the client import is resumed** | Partners are already imported. Remind them: **never fetch task descriptions through tooling** |

## Also hand over

- Access to **`app.bescrm.net`** as a real BES user, at a role that is **not**
  owner — so they experience the capability model from inside.
- A **Partner Portal** login for a test partner, for the same reason.
- The repository's `CLAUDE.md` and this `docs/` package, read before day one if
  possible.

## Security notes for whoever grants these

- **Do not email keys or paste them into chat.** Every secret this platform uses
  already lives in Supabase Function secrets, Supabase Vault or the provider's
  own dashboard. A new engineer needs *access to the dashboard*, not a copy of
  the key.
- **The repository contains no secrets** — audited 2026-09-13, see
  `docs/SECURITY.md`. Keep it that way.
- **Rotation at handoff** is a reasonable precaution but is not required by
  anything found in the repository. If Dee wants rotation, do it service by
  service with the new engineer present, and update Supabase secrets and Vercel
  env vars in the same sitting.
- **Revoke on departure**, in the same order.
