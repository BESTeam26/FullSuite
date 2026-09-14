/**
 * `in_scope()` against `in_scope_next()`, over the fourteen shapes Dee listed.
 *
 * Both functions are called with IDENTICAL inputs as the SAME authenticated
 * user, inside transactions that are rolled back. Where a shape does not exist
 * in production it is constructed inside the rollback, so the matrix covers
 * every case rather than only the ones the roster happens to hold today.
 *
 * Run: node supabase/scripts/in-scope-matrix.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
const one = (s) => q.query(s)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER  = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
const ADMIN  = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
  where m.role='agency_admin' and not m.is_owner and m.status='active'
    and coalesce(p.is_fixture,false)=false limit 1`).user_id;
const AGENT  = one(`select m.user_id from agency_memberships m join profiles p on p.id=m.user_id
  where m.role='agency_user' and m.status='active' and coalesce(p.is_fixture,false)=false limit 1`).user_id;
const CO_TEAM = one(`select t.id, t.department_id from teams t
   join departments dp on dp.id=t.department_id
   join divisions dv on dv.id=dp.division_id and dv.service='creditops'
  where t.archived_at is null and coalesce(t.is_fixture,false)=false limit 1`);
const TO_TEAM = one(`select t.id from teams t
   join departments dp on dp.id=t.department_id
   join divisions dv on dv.id=dp.division_id and dv.service='talentops'
  where t.archived_at is null and coalesce(t.is_fixture,false)=false limit 1`).id;
const STRANGER = one(`select id from profiles
  where id not in (select user_id from agency_memberships where user_id is not null)
    and coalesce(is_fixture,false)=false limit 1`)?.id;

/** Both functions, same inputs, same session. */
function compare(user, setup, args) {
  const { division = "null", team = "null", assignee = "null", creator = "null" } = args;
  const d = division === "null" ? "null" : `'${division}'::public.fulfillment_service`;
  const t = team === "null" ? "null" : `'${team}'::uuid`;
  const a = assignee === "null" ? "null" : `'${assignee}'::uuid`;
  const c = creator === "null" ? "null" : `'${creator}'::uuid`;
  try {
    const r = q.query(`begin; ${setup}
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
      select public.in_scope('${AGENCY}', ${d}, ${t}, ${a}, ${c}) as old,
             public.in_scope_next('${AGENCY}', ${d}, ${t}, ${a}, ${c}) as nu;
      rollback`)[0];
    return { old: r.old, nu: r.nu };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { old: "ERR", nu: String(e.message).slice(0, 40) };
  }
}

const rows = [];
const shape = (n, label, user, setup, args, expected, why = "") => {
  const { old, nu } = compare(user, setup, args);
  const changed = old !== nu;
  const ok = nu === expected;
  rows.push({ n, label, old, nu, expected, changed, ok, why });
};

/* Place somebody, inside the rollback, so a shape that does not exist in
   production is still measured rather than skipped. */
const place = (user, ...teams) =>
  `delete from team_memberships where user_id='${user}';` +
  teams.map((t) => `insert into team_memberships (team_id,user_id,is_lead) values ('${t}','${user}',false);`).join("");
const lead = (user, team) =>
  `delete from team_memberships where user_id='${user}';` +
  `insert into team_memberships (team_id,user_id,is_lead) values ('${team}','${user}',true);`;

shape(1, "Agency Admin", ADMIN, "", { division: "creditops" }, true,
  "is_admin_of, first branch, untouched");
/* Division alone no longer grants generic work (0347). It still decides
   module access and the directory rules that name it explicitly — neither of
   which goes through in_scope. */
shape(2, "User, one Division — division ALONE", AGENT, place(AGENT, CO_TEAM.id),
  { division: "creditops" }, false,
  "division gets you into the building, not into every room");
shape(3, "User, two Divisions — division ALONE", AGENT, place(AGENT, CO_TEAM.id, TO_TEAM),
  { division: "talentops" }, false,
  "same: placement is not a work grant");
shape(4, "User, one Department", AGENT, place(AGENT, CO_TEAM.id), { team: CO_TEAM.id }, true,
  "record's team is in a department they belong to");
shape(5, "User, multiple Departments", AGENT, place(AGENT, CO_TEAM.id, TO_TEAM), { team: TO_TEAM }, true,
  "union of departments, not one");
shape(6, "User, one Team", AGENT, place(AGENT, CO_TEAM.id), { team: CO_TEAM.id }, true,
  "old already read team_memberships here; the enum gate is gone");
shape(7, "User, multiple Teams", AGENT, place(AGENT, CO_TEAM.id, TO_TEAM), { team: CO_TEAM.id }, true,
  "same");
shape(8, "Personally assigned record", AGENT, place(AGENT), { assignee: AGENT }, true,
  "unconditional in both — this IS what `assigned` meant");
shape(9, "Assigned, no placement at all", AGENT, `delete from team_memberships where user_id='${AGENT}';`,
  { division: "creditops", assignee: AGENT }, true,
  "personal assignment survives losing every placement");
shape(10, "Creator / self", AGENT, place(AGENT), { creator: AGENT }, false,
  "OLD granted only with scope='self'; nobody holds it. NEW omits it rather than making it unconditional, which would be a widening");
shape(11, "Team Lead", AGENT, lead(AGENT, CO_TEAM.id), { team: CO_TEAM.id }, true,
  "is_team_lead_of, untouched");
shape(12, "Removed membership", AGENT, `delete from team_memberships where user_id='${AGENT}';`,
  { division: "creditops", team: CO_TEAM.id }, false,
  "scope narrows the moment the row goes");
shape(13, "Inactive membership", AGENT,
  place(AGENT, CO_TEAM.id) + `update teams set archived_at=now() where id='${CO_TEAM.id}';`,
  { division: "creditops", team: CO_TEAM.id }, false,
  "an archived team places nobody");
shape(14, "No organizational placement", AGENT, `delete from team_memberships where user_id='${AGENT}';`,
  { division: "creditops" }, false,
  "a non-admin with no placement reaches nothing");
if (STRANGER) {
  shape(15, "Not agency staff at all", STRANGER, "", { division: "creditops", team: CO_TEAM.id }, false,
    "outside the agency entirely");
}

/*
 * The rows that matter most: every change above is a WIDENING, so the question
 * is not whether the new model grants — it is whether it grants anything it
 * should not. These are the denials.
 */
const OTHER_CO_TEAM = one(`select t.id from teams t
   join departments dp on dp.id=t.department_id
   join divisions dv on dv.id=dp.division_id and dv.service='creditops'
  where t.archived_at is null and coalesce(t.is_fixture,false)=false
    and t.id <> '${CO_TEAM.id}' and t.department_id <> '${CO_TEAM.department_id}' limit 1`)?.id;

shape(16, "CreditOps user, TalentOps record", AGENT, place(AGENT, CO_TEAM.id),
  { division: "talentops" }, false,
  "placement in one division must not reach another");
shape(17, "CreditOps user, FundingOps record", AGENT, place(AGENT, CO_TEAM.id),
  { division: "fundingops" }, false,
  "same, for a division nobody here is placed in");
if (OTHER_CO_TEAM) {
  shape(18, "Same division, another department's team", AGENT, place(AGENT, CO_TEAM.id),
    { team: OTHER_CO_TEAM }, false,
    "division access is separate from department work — a record identified only by another department's team must not resolve");
}
shape(19, "Placed, but record has no division or team", AGENT, place(AGENT, CO_TEAM.id),
  {}, false,
  "nothing to match on is not a reason to grant");
shape(20, "Record assigned to SOMEBODY ELSE", AGENT, place(AGENT),
  { assignee: OWNER }, false,
  "another person's assignment is not yours");

console.log("\nin_scope() vs in_scope_next()\n");
console.log("   # shape                          old    new    expected  changed");
console.log("   ─────────────────────────────────────────────────────────────────");
for (const r of rows) {
  const mark = r.ok ? " " : "!";
  console.log(`  ${mark}${String(r.n).padStart(2)} ${r.label.padEnd(30)} ${String(r.old).padEnd(6)} ${String(r.nu).padEnd(6)} ${String(r.expected).padEnd(9)} ${r.changed ? "CHANGED" : "-"}`);
}
const changed = rows.filter((r) => r.changed);
const wrong = rows.filter((r) => !r.ok);
console.log("\n  Differences, with the reason:");
if (changed.length === 0) console.log("    none — behaviour is identical across every shape");
for (const r of changed) console.log(`    ${r.n}. ${r.label}: ${r.old} -> ${r.nu}\n       ${r.why}`);
if (wrong.length) {
  console.log("\n  NOT AS EXPECTED:");
  for (const r of wrong) console.log(`    ${r.n}. ${r.label}: expected ${r.expected}, got ${r.nu}`);
}
console.log();
process.exitCode = wrong.length ? 1 : 0;
