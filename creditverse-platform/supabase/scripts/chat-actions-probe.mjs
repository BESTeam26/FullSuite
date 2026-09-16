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
/* A channel with traffic, and a message in it. */
const CH = one(`select m.channel_id as id, count(*) n from messages m
   where m.deleted_at is null group by m.channel_id order by n desc limit 1`).id;
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

console.log(`\n${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
