/**
 * Regenerate set_work_schedule with its permission check narrowed to the
 * caller's management scope. One string replacement over the LIVE definition
 * — never a retype (three dropped-branch incidents in this repository).
 *
 * Run: node supabase/scripts/gen-set-work-schedule.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";
import { writeFileSync } from "node:fs";
const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(), baseUrl: new URL("./lib/", import.meta.url) });
const def = q.query(`select pg_get_functiondef(oid) as d from pg_proc
  where proname='set_work_schedule' and pronamespace='public'::regnamespace`)[0].d;

const marker = `if not public.is_manager_of(v_agency) then
    raise exception 'Setting a schedule needs management access' using errcode = '42501';
  end if;`;
const n = def.split(marker).length - 1;
if (n !== 1) { console.error(`expected exactly one permission check, found ${n}`); process.exit(1); }
const patched = def.replace(marker,
  `/* Management capability, INSIDE the caller's scope. A division manager
     sets schedules for their division, not the company; a team lead reads
     their team's schedule but does not set it (§20b). */
  if not public.is_manager_of(v_agency) then
    raise exception 'Setting a schedule needs management access' using errcode = '42501';
  end if;
  if not public.may_view_workforce_record(v_agency, p_user) then
    raise exception 'That person is outside your management scope' using errcode = '42501';
  end if;`);

const header = `-- Work schedules: read and write within management scope.
--
-- Dee, 2026-09-19, Team Management: "each tab proving both UI scope and
-- backend scope." The Schedule tab lists managed_people(); the rows behind it
-- were still authorized on is_manager_of(agency) — company-wide for any
-- manager, the same leak §20b closed for attendance, corrections and rewards
-- (0263). A division manager could read, and SET, every schedule in BES.
--
-- Reads now use may_view_workforce_record: self, a lead of your team, or
-- management within its own scope. Writes keep the management requirement
-- (a lead reads their team's schedule and does not set it — unchanged) and
-- add the same scope check.
--
-- The function is GENERATED from the live definition by
-- supabase/scripts/gen-set-work-schedule.mjs with a single string replacement.

drop policy if exists work_schedules_select on public.work_schedules;
create policy work_schedules_select on public.work_schedules
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.may_view_workforce_record(agency_id, user_id));

`;
writeFileSync("supabase/migrations/20260919008000_work_schedule_scope.sql", header + patched + ";\n");
console.log("written; replacements:", n);
