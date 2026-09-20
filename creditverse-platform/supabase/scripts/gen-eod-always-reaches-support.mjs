/**
 * An End of Day report always reaches somebody.
 *
 * Generated from the live definition by exact replacement rather than
 * retyped — the function carries the whole team-rollup query and a retype is
 * how an unrelated line quietly changes.
 *
 * Run: node supabase/scripts/gen-eod-always-reaches-support.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const once = (text, marker, replacement, what) => {
  const n = text.split(marker).length - 1;
  if (n !== 1) { console.error(`${what}: expected one marker, found ${n}`); process.exit(1); }
  return text.replace(marker, replacement);
};

let fn = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='eod_queue_email' and pronamespace='public'::regnamespace`)[0].d;

fn = once(fn,
  `  v_leads  boolean;`,
  `  v_leads  boolean;
  /* The address that receives every report, whether or not a lead resolved. */
  v_support constant text := 'support@blessedempireservices.com';`,
  "declare support");

fn = once(fn,
  `  if v_lead.email is null then v_state := 'unavailable'; end if;`,
  `  /* No lead resolved. The report used to stop here, recorded as
     'unavailable' and mailed to nobody — including BES, which was copied on
     every other report. Eight of the roster are on no team, so eight people's
     day would have gone unseen. It now goes to support as the recipient
     rather than the copy, and the routing reason travels in the payload so
     the reader can see it reached them because nobody else was named. */
  if v_lead.email is null then v_state := 'pending'; end if;`,
  "no-lead state");

fn = once(fn,
  `    v_lead.email, v_lead.name,
    'support@blessedempireservices.com',`,
  `    coalesce(v_lead.email, v_support),
    coalesce(v_lead.name, 'BES Support'),
    /* Copying support on a message already addressed to them is a duplicate
       in everybody's inbox. */
    case when v_lead.email is null then null else v_support end,`,
  "recipient");

writeFileSync(new URL("../migrations/20260920006000_an_eod_report_always_reaches_somebody.sql", import.meta.url),
`-- An End of Day report always reaches somebody.
--
-- Dee, 2026-09-20: "once EOD is submitted it's not only in the app but also
-- sent to the team lead's email and my support@blessedempireservices.com
-- email."
--
-- The lead half and the support copy were already built. What was not: a
-- report with no lead stopped dead, recorded as 'unavailable' and mailed to
-- nobody — not even to support, which was copied on every other report.
-- Eight of the current roster are on no team, so eight people's day would
-- have gone unseen the first week.
--
-- Support is now the RECIPIENT when no lead is named, rather than a copy of a
-- message that was never sent, and is not copied on a message already
-- addressed to them. The routing reason already travels in the payload, so a
-- reader can tell why it came to them.
--
-- Regenerated from the live definition — see
-- supabase/scripts/gen-eod-always-reaches-support.mjs.

${fn};
`);
console.log("written");
