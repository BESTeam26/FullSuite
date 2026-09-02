# Supabase backend

## Layout
- `migrations/` — schema, RLS policies, helper functions. Applied in filename order.
- `seed.sql` — idempotent development data (5 sample organizations). No users.
- `config.toml` — CLI config (local stack needs Docker; not required for hosted use).

## First-time setup (hosted project)
1. Create a Supabase project at supabase.com (free tier is fine for dev).
2. In `creditverse-platform/`: `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. Push the schema: `npx supabase db push`.
4. Seed sample orgs: paste `seed.sql` into the SQL editor and run it.
5. Copy `.env.example` → `.env.local`; fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   from Project Settings → API. Restart `npm run dev`.
6. Sign up in the app at `/login` (confirm the email), then in the SQL editor run:
   `select public.bootstrap_agency_owner('you@example.com');`
   Reload the app — you are now BES agency owner and see all sub-accounts.
7. Regenerate types after any migration:
   `npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`

## Security rules of thumb
- Only the **anon** key goes in the browser. Never the service_role key.
- Every table has RLS enabled; policies use the `SECURITY DEFINER` helpers
  (`is_agency_staff()`, `is_org_member()`, …) so they never recurse.
- `bootstrap_agency_owner()` is revoked from `anon`/`authenticated`; it can only
  run from the SQL editor or CLI (service role).
