/**
 * Where every BES team invitation stands.
 *
 * Dee, 2026-09-13, on activating the team for UAT: "Once sent, track: sent ·
 * accepted · pending · failed."
 *
 * Read-only. It sends nothing and changes nothing — sending is done from the
 * People & Access screen, with a real session, because `send-invitation` reads
 * the invitation as the CALLER and lets row-level security decide whether they
 * may send it. That is deliberate: an invitation attributed to "the system"
 * rather than to a person is a worse record.
 *
 * Run: node supabase/scripts/invitation-status.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

const rows = q.query(`
  select i.email::text            as email,
         coalesce(p.full_name, '') as name,
         i.agency_role::text      as role,
         coalesce(t.name, '')     as team,
         i.lead_team_id is not null as is_lead,
         i.access_profile::text   as profile,
         i.accepted_at is not null as accepted,
         i.expires_at < now()     as expired,
         /* The one action that means an email actually LEFT (0351).
            agency_invitation.sent is NOT it: despite the name, that is
            written when an invitation is CREATED, which is a different fact
            and reading it as a send is a mistake this script already made
            once. */
         (select max(a.created_at)::date from public.audit_log a
           where a.entity_id = i.id::text
             and a.action = 'invitation.emailed')      as last_sent,
         (select max(a.created_at)::date from public.audit_log a
           where a.entity_id = i.id::text
             and a.action = 'agency_invitation.sent')  as created_log,
         (m.user_id is not null and m.status = 'active') as active_member
    from public.invitations i
    left join public.teams t              on t.id = i.team_id
    left join public.profiles p           on lower(p.email::text) = lower(i.email::text)
    left join public.agency_memberships m on m.user_id = p.id
   where i.kind = 'agency'
   order by t.name nulls last, i.email
`);

const bucket = (r) =>
  r.accepted && r.active_member ? "ACCEPTED"
  : r.accepted ? "accepted, no active membership"
  : r.expired ? "EXPIRED"
  : r.last_sent ? "EMAILED, awaiting acceptance"
  : "no send recorded";

const counts = {};
for (const r of rows) counts[bucket(r)] = (counts[bucket(r)] ?? 0) + 1;

console.log("\nBES team invitations\n");
let team = null;
for (const r of rows) {
  if (r.team !== team) { team = r.team; console.log(`  ${team || "— no team —"}`); }
  const state = bucket(r);
  const mark = state === "ACCEPTED" ? "  ok  "
    : state === "SENT, awaiting acceptance" ? " wait "
    : state === "no send recorded" ? " ?    " : " !!   ";
  console.log(`   ${mark} ${r.email.padEnd(34)} ${(r.name || "").padEnd(22)}` +
    `${r.is_lead ? "TEAM LEAD  " : "           "}${state}` +
    `${r.last_sent ? `  (sent ${r.last_sent})` : ""}`);
}

console.log("\n  " + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("   ") + "\n");

/* Honest about what is and is not knowable. Send recording only began with
   migration 0351 — anything emailed before that left no trace, so "no send
   recorded" means exactly that and NOT "no email was sent". */
const unrecorded = rows.filter((r) => bucket(r) === "no send recorded").length;
if (unrecorded > 0) {
  console.log(`  ${unrecorded} invitation${unrecorded === 1 ? " has" : "s have"} no send on record.`);
  console.log("  Sends are only recorded from 2026-09-14 (migration 0351). Before that");
  console.log("  nothing logged them, so this means UNKNOWN, not \"never sent\".");
  console.log("  Press Send again and this column becomes trustworthy.\n");
}

/* A team the platform thinks nobody is on is worth naming, because an empty
   queue during UAT reads as a broken screen rather than as missing people. */
const empty = q.query(`
  select t.name
    from public.teams t
   where t.archived_at is null and coalesce(t.is_fixture, false) = false
     and not exists (select 1 from public.team_memberships m where m.team_id = t.id)
   order by 1`);
if (empty.length) {
  console.log("  Teams with no members yet:");
  for (const t of empty) console.log(`    · ${t.name}`);
  console.log();
}
