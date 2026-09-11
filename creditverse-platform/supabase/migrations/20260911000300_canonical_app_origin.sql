-- =============================================================================
-- The BES logo in every branded email moves to the canonical domain.
--
-- `app.bescrm.net` went live 2026-09-11 and is now the platform's front door
-- (Supabase Site URL, redirect allow-list, and the `APP_ORIGINS` the three
-- mailing functions pin their links to). `bes-full-suite.vercel.app` still
-- serves the app and stays working on purpose — it is simply no longer the
-- address BES puts in front of people.
--
-- The agency's stored `logoUrl` was seeded at the Vercel host (0271), so a mail
-- sent from `noreply@bescrm.net`, linking to `app.bescrm.net`, still pulled its
-- header image from a third address. That is the same sender-vs-content domain
-- mismatch behind P-001 — Gmail reads a message whose parts disagree about who
-- sent it as less trustworthy — and it is the last reference to the old host in
-- anything a recipient receives.
--
-- Written as a targeted replace rather than a re-seed so a logo Dee has since
-- uploaded to storage is left exactly as it is.
-- =============================================================================

update public.agencies
   set branding = jsonb_set(branding, '{logoUrl}', '"https://app.bescrm.net/bes-logo.png"'::jsonb)
 where branding->>'logoUrl' = 'https://bes-full-suite.vercel.app/bes-logo.png';

update public.organizations
   set branding = jsonb_set(branding, '{logoUrl}', '"https://app.bescrm.net/bes-logo.png"'::jsonb)
 where branding->>'logoUrl' = 'https://bes-full-suite.vercel.app/bes-logo.png';
