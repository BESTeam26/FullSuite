/**
 * Every chat action, sent EXACTLY the way the client sends it.
 *
 * Dee, 2026-09-16, from real use: *"Emojis and other functions of the chat is
 * not working / communication."*
 *
 * Emoji reactions had never worked once, for anybody, and no test caught it —
 * including mine. The certification probe "tested" reactions by writing the
 * insert the way the SCHEMA wanted, with an explicit `user_id`. The client
 * omits it, because thirty-one other tables default that column to
 * `auth.uid()` and this one did not. So the probe passed and the button
 * didn't.
 *
 * The lesson is the whole design of this file: a write probe must send the
 * COLUMN LIST THE CLIENT SENDS, not a corrected version of it. Every case
 * below is copied from `src/lib/data/messages.ts` and `channels.ts` — if a
 * call site changes its columns, this must change with it or it stops meaning
 * anything.
 *
 * Runs as real authenticated users, inside rolled-back transactions.
 *
 * Run: node supabase/scripts/chat-actions-probe.mjs
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
const as = (user, sql) => {
  try {
    return { ok: true, rows: q.query(`begin;
      set local role authenticated;
      do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
      ${sql} rollback;`) };
  } catch (e) {
    try { q.query("rollback;"); } catch { /* gone */ }
    return { ok: false, message: String(e.message ?? e).split("\n")[0].replace(/^.*ERROR:\s*/, "") };
  }
};
/** Did the client's own statement succeed? Prints the refusal when it did not. */
const accepts = (user, sql) => { const r = as(user, sql); return r.ok ? true : r.message; };

const AGENCY = one("select id from agencies order by created_at limit 1").id;
const OWNER  = one("select user_id from agency_memberships where is_owner and status='active' limit 1").user_id;
/* A real agent, found by shape rather than by name. */
const AGENT = one(`select p.id from agency_memberships m
    join profiles p on p.id = m.user_id
   where m.role = 'agency_user' and m.status = 'active' and coalesce(p.is_fixture,false) = false
   limit 1`).id;
/*
 * A channel BOTH test users can actually read, with traffic in it.
 *
 * This used to pick "the channel with the most messages", full stop. That is a
 * fixture that decays: as the team actually uses the product, the busiest
 * conversation became a DIRECT MESSAGE between two other people — which the
 * owner correctly cannot read — and twelve checks failed reporting 42501 on
 * every write, as though the product had broken. It had not; the probe had
 * pointed itself at a private conversation.
 *
 * So visibility is part of the selection, asked of the database as each user
 * rather than assumed from the channel's kind.
 */
const readableBy = (user) => q.query(`begin;
  set local role authenticated;
  do $c$ begin perform set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); end $c$;
  select m.channel_id as id, count(*) as n
    from messages m
   where m.deleted_at is null and public.channel_visible(m.channel_id)
   group by m.channel_id order by n desc;
  rollback;`).map((r) => r.id);

const ownerCan = readableBy(OWNER);
const agentCan = new Set(readableBy(AGENT));
const CH = ownerCan.find((id) => agentCan.has(id));
if (!CH) {
  console.log("\n  SKIPPED — no conversation both the owner and an agent can read.\n");
  process.exit(0);
}
/* A ROOT message. The newest message in a busy channel is often itself a
   thread reply, and "Reply to the thread, not to a reply inside it" is a rule
   this product deliberately enforces — picking one would test the guard, not
   the feature. */
const MSG = one(`select id from messages where channel_id = '${CH}' and deleted_at is null
                   and parent_message_id is null order by id desc limit 1`).id;

console.log("\nEvery chat action, in the client's own words\n");
console.log(`channel ${CH}  ·  message ${MSG}\n`);

for (const [label, user] of [["owner", OWNER], ["agent", AGENT]]) {
  console.log(`As the ${label}`);

  /* messages.ts toggleReaction — insert({ message_id, emoji }). No user_id. */
  check(`${label}: add an emoji reaction`,
    accepts(user, `insert into message_reactions (message_id, emoji) values ('${MSG}', '👍');`), true);

  check(`${label}: remove their own reaction`,
    accepts(user, `insert into message_reactions (message_id, emoji) values ('${MSG}', '👍');
                   delete from message_reactions where message_id = '${MSG}' and emoji = '👍';`), true);

  /* messages.ts pinMessage — insert({ channel_id, message_id }). No pinned_by,
     which works because that column DOES default to auth.uid(); it is the
     sibling that showed `message_reactions.user_id` was the irregular one.
     Pinning itself is `channel_manager` only, deliberately, so this asserts
     the rule rather than expecting everyone to succeed. */
  {
    /* ASK the database who manages this channel; do not reimplement the rule.
       The first version of this check tested `channel_members.is_manager` and
       called the owner a non-manager — `channel_manager()` also grants an
       agency administrator by role, which is the branch that matters most. A
       test that restates a rule can only ever disagree with it. */
    const manager = as(user, `select public.channel_manager('${CH}') as m;`).rows[0].m;
    const got = accepts(user, `insert into message_pins (channel_id, message_id) values ('${CH}', '${MSG}');`);
    check(`${label}: pinning follows channel management (manages: ${manager})`,
      got === true, manager);
  }

  /* messages.ts sendMessage — author_id IS sent. */
  check(`${label}: send a message`,
    accepts(user, `insert into messages (channel_id, author_id, body, body_text)
                   values ('${CH}', auth.uid(), '{}'::jsonb, '[probe] hello');`), true);

  /* …and a threaded reply, the same insert plus parent_message_id. */
  check(`${label}: reply in a thread`,
    accepts(user, `insert into messages (channel_id, author_id, body, body_text, parent_message_id)
                   values ('${CH}', auth.uid(), '{}'::jsonb, '[probe] reply', '${MSG}');`), true);

  /* messages.ts editOwnMessage — update on a message of their own. */
  /* `messages.id` is an identity column — the client never supplies one, and
     nor can this. Write one, then edit the row that came back. */
  check(`${label}: edit their own message`,
    accepts(user, `with mine as (
                     insert into messages (channel_id, author_id, body, body_text)
                     values ('${CH}', auth.uid(), '{}'::jsonb, '[probe] mine') returning id)
                   update messages set body_text = '[probe] edited', edited_at = now()
                    where id = (select id from mine);`), true);

  /* messages.ts attachToMessage — insert into files with NO agency_id. */
  check(`${label}: attach a file to a message`,
    accepts(user, `insert into files (organization_id, entity_type, entity_id, bucket, path, name, mime_type, size_bytes, uploaded_by)
                   values (null, 'channel_message', '${MSG}', 'bes-files',
                           'agency/channels/${CH}/probe.png', 'probe.png', 'image/png', 10, auth.uid());`), true);

  /* channels.ts mark_channel_read */
  check(`${label}: mark the conversation read`,
    accepts(user, `select public.mark_channel_read('${CH}');`), true);

  /* The reads the pane performs on open. */
  const reads = as(user, `select
    (select count(*)::int from public.channel_messages('${CH}', 50)) as messages,
    (select count(*)::int from public.thread_messages('${MSG}')) as thread,
    (select count(*)::int from public.channel_mentionable('${CH}')) as mentionable,
    (select count(*)::int from public.visible_channels()) as channels;`);
  check(`${label}: the conversation pane's four reads all answer`, reads.ok, true);
  if (reads.ok) {
    check(`${label}: …and the channel list is not empty`, reads.rows[0].channels > 0, true);
    check(`${label}: …and @mention suggestions are offered`, reads.rows[0].mentionable > 0, true);
  }
  console.log("");
}

console.log("Realtime can actually carry each of these");
{
  /* A feature that only the clicker can see is half a feature. The publication
     is the gate: `use-message-realtime` can subscribe to whatever it likes,
     but nothing is delivered for a table Postgres is not publishing. */
  const published = q.query(`select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'`).map((r) => r.tablename);
  check("messages are published for realtime", published.includes("messages"), true);
  check("so are reactions — they used to need a reload", published.includes("message_reactions"), true);

  /* Removing a reaction is a DELETE, and a DELETE payload carries only the
     replica identity. The default is the primary key, which here is the whole
     (message_id, user_id, emoji) triple — so a removal names its message. */
  const pk = one(`select pg_get_constraintdef(oid) as d from pg_constraint
                   where conrelid = 'message_reactions'::regclass and contype = 'p'`).d;
  check("a reaction's key identifies its message, so removals can be applied",
    /message_id/.test(pk) && /emoji/.test(pk), true);
}

console.log("The partner context panel shows context, never new access");
{
  const g = one(`select g.id from outsourcing_groups g
                  join partner_services ps on ps.group_id = g.id and ps.status in ('active','onboarding')
                 where g.archived_at is null limit 1`);
  if (g) {
    /* Somebody assigned to this partner, and somebody who is not. By shape. */
    const assigned = one(`select a.user_id from partner_assignments a
        join agency_memberships m on m.user_id = a.user_id and m.role = 'agency_user' and m.status = 'active'
        join profiles p on p.id = a.user_id and coalesce(p.is_fixture,false) = false
       where a.group_id = '${g.id}' and a.ended_on is null limit 1`)?.user_id;
    const stranger = one(`select m.user_id from agency_memberships m
        join profiles p on p.id = m.user_id and coalesce(p.is_fixture,false) = false
       where m.role = 'agency_user' and m.status = 'active'
         and not exists (select 1 from partner_assignments a
                          where a.group_id = '${g.id}' and a.user_id = m.user_id and a.ended_on is null)
       limit 1`)?.user_id;

    /* `as` here takes (user, sql) — the certification probe's takes a setup
       argument in the middle, and passing that shape sent an empty string as
       the query and quietly measured nothing. */
    const rows = (u) => as(u, `select * from public.partner_conversation_context('${g.id}');`);

    const owner = rows(OWNER);
    check("the owner sees the partner's context", owner.ok && owner.rows.length === 1, true);
    check("…including the money, which is theirs to see",
      owner.ok && owner.rows[0].balance_visible, true);

    if (assigned) {
      const r = rows(assigned);
      check("an assigned agent sees the context", r.ok && r.rows.length === 1, true);
      /* The whole point of the second half of Dee's sentence: context, not
         authorization. Money stays behind its own gate. */
      check("…but not the balance, which is owner-gated",
        r.ok && r.rows[0].balance_visible, false);
      check("…and a withheld balance is NULL, never zero",
        r.ok && r.rows[0].balance_cents, null);
    }
    if (stranger) {
      const r = rows(stranger);
      check("an agent not assigned to this partner gets no context at all",
        r.ok ? r.rows.length : "error", 0);
    }
    const contact = one(`select user_id from partner_contacts where user_id is not null and status = 'active' limit 1`);
    if (contact) {
      const r = rows(contact.user_id);
      check("a partner contact gets none of it — this is a BES-side panel",
        r.ok ? r.rows.length : "error", 0);
    }
  }
}

console.log("Search finds exactly what the searcher could already open");
{
  /* SECURITY INVOKER is the whole design: five tables, five policies, each
     answering for itself. The test of that is not the counts — it is that a
     narrower person never finds MORE than a broader one. */
  const kinds = (u, term) => {
    const r = as(u, `select kind, count(*)::int as n from public.search_communication('${term}', 40) group by 1;`);
    return r.ok ? Object.fromEntries(r.rows.map((x) => [x.kind, x.n])) : { error: 1 };
  };
  const at = (m, k) => m[k] ?? 0;

  const owner = kinds(OWNER, "Test");
  const agent = kinds(AGENT, "Test");
  check("the owner finds things", Object.keys(owner).length > 0, true);
  check("an agent never finds more messages than the owner", at(agent, "message") <= at(owner, "message"), true);
  check("…nor more partners", at(agent, "partner") <= at(owner, "partner"), true);
  check("…nor more people", at(agent, "person") <= at(owner, "person"), true);

  const contact = one(`select user_id from partner_contacts where user_id is not null and status = 'active' limit 1`);
  if (contact) {
    const theirs = kinds(contact.user_id, "Test");
    /* The one that would matter most if the composition were wrong: a partner
       must not be able to enumerate BES staff through a search box. */
    check("a partner contact finds no BES people at all", at(theirs, "person"), 0);
    check("…and no BES-internal messages", at(theirs, "message") <= at(owner, "message"), true);
  }

  const short = as(OWNER, "select count(*)::int as n from public.search_communication('a', 40);");
  check("a one-character query returns nothing rather than everything",
    short.ok ? short.rows[0].n : "error", 0);
}

console.log("The rules that must survive the fix");
{
  const other = one(`select id from profiles where id <> '${AGENT}' and id <> '${OWNER}' limit 1`).id;
  check("nobody can react as somebody else",
    accepts(AGENT, `insert into message_reactions (message_id, user_id, emoji)
                    values ('${MSG}', '${other}', '👍');`) !== true, true);

  check("nobody can edit another person's message",
    as(AGENT, `update messages set body_text = '[probe] hijacked' where id = '${MSG}' and author_id <> auth.uid();
               select count(*)::int as n from messages where id = '${MSG}' and body_text = '[probe] hijacked';`)
      .rows?.[0]?.n ?? "refused", 0);

  const contact = one(`select user_id from partner_contacts where user_id is not null and status = 'active' limit 1`);
  if (contact) {
    check("a partner contact cannot react inside a BES-internal conversation",
      accepts(contact.user_id, `insert into message_reactions (message_id, emoji) values ('${MSG}', '👍');`) !== true, true);
  }
}

/*
 * Opening a conversation costs ONE call.
 *
 * Dee, 2026-09-17: *"make sure we have running this communication as fast as
 * we can, no delays."* The tab strip's three numbers used to be a second
 * per-conversation round trip (`channel_tab_counts`) fired on every click in
 * the rail — the waterfall rule 14 names. They now ride on `channel_details`,
 * which the pane already calls. These checks are what stops the second call
 * from quietly coming back.
 */
console.log("Opening a conversation costs one call");
{
  const d = as(OWNER, `select public.channel_details('${CH}') as d;`);
  const details = d.ok ? d.rows[0].d : null;
  check("channel_details answers at all", details !== null, true);
  for (const key of ["files", "pins", "member_count"]) {
    check(`…and carries ${key}, so the tab strip needs no second query`,
      details !== null && typeof details[key] === "number", true);
  }
  /* The counts must be REAL, not zeroes standing in for a dropped subquery. */
  const members = one(`select count(*)::int as n from public.mention_group_recipients('${CH}', 'channel')`).n;
  check("member_count matches who can actually be reached", details?.member_count, members);

  check("the second per-conversation call no longer exists",
    one(`select count(*)::int as n from pg_proc
          where proname = 'channel_tab_counts' and pronamespace = 'public'::regnamespace`).n, 0);
}

/*
 * Whose clock a conversation is read on.
 *
 * Dee, 2026-09-17: *"for all internal BES, time should be EST. For partners,
 * time will follow their Time Zone on all partner GC and Partner Channels."*
 * The zone is a property of the CHANNEL, resolved in the database, because the
 * browser only knows the reader's own.
 */
console.log("Whose clock a conversation is read on");
{
  check("a BES conversation reads on the agency's clock",
    one(`select public.channel_timezone('${CH}') as tz`).tz,
    one(`select coalesce(a.eod_timezone, 'America/New_York') as tz from public.agencies a
          join public.channels c on c.agency_id = a.id where c.id = '${CH}'`).tz);

  const partnerCh = one(`select c.id, g.timezone from public.channels c
      join public.outsourcing_groups g on g.id = c.partner_group_id limit 1`);
  if (partnerCh) {
    check("a partner conversation reads on the partner's clock",
      one(`select public.channel_timezone('${partnerCh.id}') as tz`).tz, partnerCh.timezone);
  }

  check("every conversation resolves to a zone Postgres actually knows",
    one(`select count(*)::int as n from public.channels c
          where not exists (select 1 from pg_timezone_names t
                             where t.name = public.channel_timezone(c.id))`).n, 0);

  /* A typo in the column is the failure that hides for months: `at time zone`
     ignores what it cannot resolve, so the chat is quietly an hour out. */
  let refused = false;
  try { q.query(`begin; update public.outsourcing_groups set timezone = 'America/New York'
                  where id = (select id from public.outsourcing_groups limit 1); rollback;`); }
  catch { refused = true; try { q.query("rollback;"); } catch { /* gone */ } }
  check("a misspelled timezone is refused rather than silently ignored", refused, true);

  check("the timezone rides along on the call the pane already makes",
    typeof (as(OWNER, `select public.channel_details('${CH}') as d;`).rows?.[0]?.d?.timezone), "string");

  /* Moving a partner's clock must move their conversations, or the column is
     decoration. Rolled back — this is a real partner row. */
  /* `g.` on both sides on purpose: unqualified `id` inside the subquery binds
     to `channels.id`, so the condition silently compares the wrong columns and
     matches nothing — this check quietly measured zero partners until it did. */
  const anyPartner = one(`select g.id from public.outsourcing_groups g
                           where exists (select 1 from public.channels c where c.partner_group_id = g.id) limit 1`);
  if (anyPartner) {
    const moved = q.query(`begin;
      update public.outsourcing_groups set timezone = 'Asia/Manila' where id = '${anyPartner.id}';
      select public.channel_timezone(c.id) as tz from public.channels c
       where c.partner_group_id = '${anyPartner.id}' limit 1;
      rollback;`);
    check("moving a partner's clock moves their channel with it", moved[0]?.tz, "Asia/Manila");
  }

  /*
   * The half that was missing: a GROUP CHAT carries no `partner_group_id`, so
   * the partner in the room has to be found through the membership.
   *
   * Nobody has started one yet, so the room is BUILT here and rolled back
   * rather than waiting for real traffic to make the check meaningful — the
   * shape is exactly what `open_group_conversation` produces: an
   * agency-scoped `direct` channel whose members are the only record of who
   * is in it.
   */
  const contacts = q.query(`select pc.user_id, pc.group_id from public.partner_contacts pc
      join public.outsourcing_groups g on g.id = pc.group_id
     where pc.user_id is not null and pc.status = 'active' and g.archived_at is null
     order by pc.group_id`);
  const bes = OWNER;
  if (contacts.length > 0) {
    const c0 = contacts[0];
    /* Each step is its OWN statement. A data-modifying CTE's rows are not
       visible to the rest of the statement that wrote them, so building the
       room and asking about it in one `with` reported the agency's clock and
       looked like a bug in the function. */
    const gc = q.query(`begin;
      update public.outsourcing_groups set timezone = 'Asia/Manila' where id = '${c0.group_id}';
      create temp table probe_room on commit drop as
        with made as (insert into public.channels (agency_id, kind, name, created_by)
                           values ('${AGENCY}', 'direct', '[probe] group', '${bes}')
                        returning id)
        select id from made;
      insert into public.channel_members (channel_id, user_id)
           select r.id, u from probe_room r, unnest(array['${bes}'::uuid, '${c0.user_id}'::uuid]) u;
      select public.channel_timezone((select id from probe_room)) as tz;
      rollback;`);
    check("a group chat with one partner in it reads on that partner's clock", gc[0]?.tz, "Asia/Manila");

    /* A room with two partners in it has no single "their time". */
    const other = contacts.find((c) => c.group_id !== c0.group_id);
    if (other) {
      const two = q.query(`begin;
        update public.outsourcing_groups set timezone = 'Asia/Manila'
         where id in ('${c0.group_id}', '${other.group_id}');
        create temp table probe_room2 on commit drop as
          with made as (insert into public.channels (agency_id, kind, name, created_by)
                             values ('${AGENCY}', 'direct', '[probe] two partners', '${bes}')
                          returning id)
          select id from made;
        insert into public.channel_members (channel_id, user_id)
             select r.id, u from probe_room2 r,
                    unnest(array['${bes}'::uuid, '${c0.user_id}'::uuid, '${other.user_id}'::uuid]) u;
        select public.channel_timezone((select id from probe_room2)) as tz;
        rollback;`);
      check("two partners in one room falls back to BES's clock rather than picking one",
        two[0]?.tz, one(`select coalesce(eod_timezone,'America/New_York') as tz from public.agencies where id = '${AGENCY}'`).tz);
    }
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
