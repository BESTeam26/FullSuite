/**
 * Dee, 2026-10-15: "Aaron is using support@blessedempireservices.com. Delete
 * any other email he is using aside from that." And earlier: "remove any
 * email that is user under kaori@blessedempireservices.com."
 *
 * Aaron's original login (aaron@) owns the chief-operations seat, the owner
 * flag, 14 finance/payroll permissions, two teams and two channels, and is
 * referenced by history. The support@ login, activated 2026-10-15, owned
 * nothing. So: everything moves to support@; aaron@ becomes inactive (which
 * releases any work), loses the owner flag, and its sign-in is disabled.
 * Nothing is deleted — 257 foreign keys point at profiles, and deleting the
 * login would delete or orphan the history behind them (rule 4).
 *
 * kaori@ is not Kaori's staff account (that is Naima Kaori A. Gallardo). It
 * is the "Test Partner" portal contact from 2026-09-12: sign-in disabled,
 * contact retired.
 *
 * One transaction. Dry run by default; `--commit` makes it real.
 *   node supabase/scripts/accounts-2026-10-15-aaron-and-kaori.mjs [--commit]
 */
import { createSyncQuery, readProjectRef, readAccessToken } from "./lib/sync-query.mjs";

const { query: q, close } = createSyncQuery({ projectRef: readProjectRef(), token: readAccessToken(),
  baseUrl: new URL("./lib/", import.meta.url) });
const COMMIT = process.argv.includes("--commit");
const OLD = "117e42e6-a130-48b4-b814-f69a1e933342";   // aaron@
const NEW = "406051de-1cb3-4213-a333-c52664907a08";   // support@
const dee = q(`select id from public.profiles where email = 'dee@blessedempireservices.com'`)[0].id;
const kaori = q(`select id from auth.users where email = 'kaori@blessedempireservices.com'`)[0]?.id ?? null;

const sql = `begin;
  set local role postgres;
  -- 1. support@ is the owner account; aaron@'s grants move with it
  update public.agency_memberships set is_owner = true where user_id = '${NEW}';
  insert into public.agency_member_permissions (membership_id, key, allowed)
    select n.id, ap.key, ap.allowed
      from public.agency_member_permissions ap
      join public.agency_memberships o on o.id = ap.membership_id and o.user_id = '${OLD}'
      join public.agency_memberships n on n.user_id = '${NEW}'
  on conflict (membership_id, key) do update set allowed = excluded.allowed;
  -- 2. the seat: old one ends today, new one starts today (history kept)
  insert into public.management_seats (agency_id, user_id, seat, division_id, department_id, effective_from, reason, created_by)
    select agency_id, '${NEW}', seat, division_id, department_id, current_date,
           'Dee, 2026-10-15: Aaron uses support@; moved from aaron@', '${dee}'
      from public.management_seats where user_id = '${OLD}' and effective_to is null;
  update public.management_seats set effective_to = current_date where user_id = '${OLD}' and effective_to is null;
  -- 3. teams and channels
  insert into public.team_memberships (team_id, user_id, is_lead)
    select team_id, '${NEW}', is_lead from public.team_memberships where user_id = '${OLD}' on conflict do nothing;
  insert into public.channel_members (channel_id, user_id)
    select channel_id, '${NEW}' from public.channel_members where user_id = '${OLD}' on conflict do nothing;
  -- 4. the one file aaron@ headlines: the department engine re-derives it
  update public.fulfillment_clients set assigned_agent_id = null where assigned_agent_id = '${OLD}';
  -- 5. retire aaron@ as Dee: inactive (releases open work), no owner flag, sign-in disabled
  set local role authenticated; set local request.jwt.claims = '{"sub":"${dee}","role":"authenticated"}';
  select public.set_agency_member_status((select id from public.agency_memberships where user_id = '${OLD}'), 'inactive');
  set local role postgres;
  update public.agency_memberships set is_owner = false where user_id = '${OLD}';
  update auth.users set banned_until = '2999-01-01', updated_at = now() where id = '${OLD}';
  -- 6. kaori@: the Test Partner portal contact — sign-in disabled, contact retired
  ${kaori ? `update auth.users set banned_until = '2999-01-01', updated_at = now() where id = '${kaori}';
  update public.partner_contacts set status = 'archived', updated_at = now() where user_id = '${kaori}';` : "-- kaori@ login not found"}
  select u.email, u.banned_until is not null as disabled, m.status, m.is_owner,
         (select count(*) from public.team_memberships t where t.user_id = u.id) as teams,
         (select count(*) from public.management_seats s where s.user_id = u.id and s.effective_to is null) as seats,
         (select count(*) from public.agency_member_permissions ap join public.agency_memberships mm on mm.id = ap.membership_id where mm.user_id = u.id) as perms,
         (select count(*) from public.channel_members c where c.user_id = u.id) as channels,
         (select string_agg(status, ',') from public.partner_contacts pc where pc.user_id = u.id) as portal_contact
    from auth.users u left join public.agency_memberships m on m.user_id = u.id
   where u.id in ('${OLD}', '${NEW}') or u.email = 'kaori@blessedempireservices.com';
  ${COMMIT ? "commit;" : "rollback;"}`;

console.log(COMMIT ? "COMMITTED" : "DRY RUN (rolled back)");
for (const r of q(sql)) console.log(JSON.stringify(r));
close();
