-- The BES logo has been in the repository (public/bes-logo.png) and live at
-- the production origin all along — but the branding record's logoUrl was an
-- empty string, so every surface that reads branding (invitation and portal
-- emails above all) fell back to a text wordmark. This points the record at
-- the served file. Guarded: it only fills an EMPTY value, so a logo Dee later
-- pastes into Settings → Agency & Branding is never overwritten by a replay.
update public.agencies
   set branding = coalesce(branding, '{}'::jsonb)
              || jsonb_build_object('logoUrl', 'https://bes-full-suite.vercel.app/bes-logo.png')
 where coalesce(nullif(trim(branding ->> 'logoUrl'), ''), '') = '';
