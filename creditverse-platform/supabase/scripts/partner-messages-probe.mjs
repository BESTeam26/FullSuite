/**
 * Partner Messages — acceptance tests against the live database.
 *
 * The same discipline as the marketing and billing probes: every scenario runs
 * inside a transaction that is rolled back, as a REAL authenticated user, and
 * every rule is asserted as somebody who should be refused as well as somebody
 * who should be allowed.
 *
 * The rule most worth proving here is the one that is easiest to get wrong:
 * a partner-owned DIRECT message must reach its two people and NOT the
 * partner's other contacts, even though every other channel they own does.
 *
 * Run: node supabase/scripts/partner-messages-probe.mjs
 */
import { createSyncQuery, readAccessToken, readProjectRef } from "./lib/sync-query.mjs";

const q = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });

let pass = 0;
const failures = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}\n       expected ${JSON.stringify(want)}\n       got      ${JSON.stringify(got)}`); }
};
const one = (sql) => q.query(sql)[0];

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
/* The one activated portal contact, and the partner they belong to. */
const CONTACT = one(`select c.user_id, c.group_id from partner_contacts c
                      join outsourcing_groups g on g.id = c.group_id
                     where c.user_id is not null and c.status='active'
                       and g.status <> 'Suspended' and g.archived_at is null limit 1`);
const ME = CONTACT.user_id, GROUP = CONTACT.group_id;
/* A BES agent who is NOT an admin, so "can_see_partner" is earned by an
   assignment rather than granted by rank. */
const AGENT = one(`select user_id from agency_memberships
                    where role='agency_user' and status='active' limit 1`).user_id;
const OTHER_AGENT = one(`select user_id from agency_memberships
                          where role='agency_user' and status='active'
                            and user_id <> '${AGENT}' limit 1`).user_id;

const as = (user, setup, action) => {
  try {
    return { ok: true, rows: q.query(
      `begin; ${setup}
       set local role authenticated;
       do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
       ${action} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* the transaction is already gone */ }
    return { ok: false, message: String(e.message ?? e) };
  }
};

/* Every scenario starts from the same fixture: the agent is named on the
   partner, so they can see it without being an administrator. */
const ASSIGNED = `insert into partner_assignments (agency_id, group_id, user_id, assignment_role, started_on, created_by)
                  values ('${AGENCY}','${GROUP}','${AGENT}','account_manager', current_date, '${OWNER}')
                  on conflict do nothing;`;

console.log("\nPartner Messages\n");

console.log("A partner contact can start a conversation");
{
  const r = as(ME, "", `select public.partner_topic_channel('${GROUP}','support') as id;`);
  check("support channel opens", r.ok && !!r.rows[0]?.id, true);

  const r2 = as(ME, "", `
    do $$ declare a uuid; b uuid; begin
      a := public.partner_topic_channel('${GROUP}','general');
      b := public.partner_topic_channel('${GROUP}','general');
      if a <> b then raise exception 'opened twice'; end if;
    end $$;
    select 1 as ok;`);
  check("pressing it twice lands in the same row", r2.ok, true);

  const r3 = as(ME, "", `select public.partner_topic_channel('${GROUP}','finance') as id;`);
  check("an invented topic is refused", r3.ok === false && /Unknown conversation topic/.test(r3.message), true);
}

console.log("\nAnd only their own partner's");
{
  const otherGroup = one(`select id from outsourcing_groups where id <> '${GROUP}' and archived_at is null limit 1`).id;
  const r = as(ME, "", `select public.partner_topic_channel('${otherGroup}','general') as id;`);
  check("another partner's conversation is refused", r.ok === false && /Not your partner/.test(r.message), true);
}

console.log("\nBES answers in the same row");
{
  const r = as(AGENT, ASSIGNED, `
    do $$ declare a uuid; b uuid; begin
      a := public.partner_topic_channel('${GROUP}','support');
      perform set_config('request.jwt.claims', '{"sub":"${ME}","role":"authenticated"}', true);
      b := public.partner_topic_channel('${GROUP}','support');
      if a <> b then raise exception 'two rows for one conversation'; end if;
    end $$;
    select 1 as ok;`);
  check("agent and partner open ONE channel", r.ok, true);
}

console.log("\nA direct message reaches two people");
{
  const r = as(ME, ASSIGNED, `select public.partner_direct_channel('${GROUP}','${AGENT}') as id;`);
  check("the partner may write to a named assignee", r.ok && !!r.rows[0]?.id, true);

  const r2 = as(ME, "", `select public.partner_direct_channel('${GROUP}','${OTHER_AGENT}') as id;`);
  check("but not to somebody who is not on the account",
    r2.ok === false && /not on your BES team/.test(r2.message), true);

  /* The rule this probe exists for. A second contact of the SAME partner sees
     the topic channel and must not see the direct one. */
  const r3 = as(ME, ASSIGNED, `
    with dm as (select public.partner_direct_channel('${GROUP}','${AGENT}') as id)
    select (select count(*) from dm) as made;`);
  check("a DM row is created", r3.ok, true);
}

console.log("\nA DM is not the whole partner's to read");
{
  const second = one(`select id from profiles
     where id not in (select user_id from agency_memberships where user_id is not null)
       and id not in (select user_id from partner_contacts where user_id is not null)
       and coalesce(is_fixture,false) = false limit 1`)?.id;

  const setup = `${ASSIGNED}
    insert into partner_contacts (agency_id, group_id, full_name, email, user_id, status)
    values ('${AGENCY}','${GROUP}','Probe Second','probe.second@example.invalid','${second}','active');`;

  /* The first contact opens a DM; the second contact must not see it, and
     must still see the topic channel. */
  const r = as(ME, setup, `
    do $$ begin perform public.partner_direct_channel('${GROUP}','${AGENT}');
                perform public.partner_topic_channel('${GROUP}','general'); end $$;
    do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${second}","role":"authenticated"}', true); end $c$;
    select
      (select count(*) from channels c where c.partner_group_id = '${GROUP}' and c.kind = 'direct')::int as dms,
      (select count(*) from channels c where c.partner_group_id = '${GROUP}' and c.partner_topic = 'general')::int as topics;`);
  const row = r.ok ? r.rows[0] : null;
  check("a colleague at the partner does NOT see the direct message", row?.dms, 0);
  check("a colleague at the partner DOES see the topic channel", row?.topics, 1);
}

console.log("\nUnassigned BES staff stay out");
{
  const r = as(OTHER_AGENT, "", `
    select (select count(*) from channels c where c.partner_group_id = '${GROUP}')::int as visible;`);
  check("an agent with no assignment sees none of it", r.ok ? r.rows[0]?.visible : "error", 0);
}

console.log("\nThe account team the portal offers");
{
  const r = as(ME, ASSIGNED, `select user_id, role_label from public.my_partner_team();`);
  const rows = r.ok ? r.rows : [];
  check("the named assignee is offered", rows.some((x) => x.user_id === AGENT), true);
  check("with what they do here", rows.find((x) => x.user_id === AGENT)?.role_label, "Account manager");

  const r2 = as(AGENT, ASSIGNED, `select count(*)::int as n from public.my_partner_team();`);
  check("BES staff get nothing from it", r2.ok ? r2.rows[0]?.n : "error", 0);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
