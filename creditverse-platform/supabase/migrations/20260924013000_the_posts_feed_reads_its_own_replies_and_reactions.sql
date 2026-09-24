-- The Posts feed can finally read its own replies and reactions.
--
-- Dee asked for ClickUp-style commenting on 2026-09-23. The database side
-- shipped that day — `activity_events.parent_id`, `activity_reactions`, and a
-- trigger that refuses a reply to anything that is not a note — and then
-- nothing used it. `client_history()` returns no id and no parent, so a
-- screen reading it cannot thread a reply or attach a reaction to anything.
-- A backend nobody can call is not a feature.
--
-- `client_posts()` is the conversation, separately from the audit trail:
-- only the notes people wrote and the notes imported from ClickUp, each with
-- its id, its parent, and its reactions. History keeps its own function and
-- stays the full record of everything that happened, collapsed, as Dee asked.
--
-- ── WHY REACTIONS COME BACK AGGREGATED ────────────────────────────────────
--
-- One row per emoji with a count and whether YOU are in it — not a list of
-- who reacted. The screen needs three things to draw a reaction pill, and
-- sending the whole roster would put every colleague's id in a payload that
-- is rendered on a client file.
--
-- Cost impact: no material increase. One bounded query per client file, on a
-- feed that was already being loaded as history.

begin;

create or replace function public.client_posts(p_client uuid)
returns table (
  id bigint,
  parent_id bigint,
  happened_at timestamptz,
  actor text,
  actor_id uuid,
  title text,
  detail text,
  imported boolean,
  reactions jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  /* Reads `activity_events` directly and is SECURITY DEFINER, so the row
     policy is not consulted — which is why the client is checked here
     instead. Same gate every other client read uses. */
  select e.id,
         e.parent_id,
         e.created_at,
         coalesce(pr.full_name, pr.email, e.actor_name, 'BES'),
         e.actor_id,
         e.action,
         public.clean_history_text(e.detail),
         (e.action ilike '%imported%' or e.action ilike '%clickup%'),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'emoji', r.emoji,
                    'count', r.n,
                    'mine', r.mine)
                  order by r.n desc, r.emoji)
             from (
               select ar.emoji,
                      count(*)::int as n,
                      bool_or(ar.user_id = auth.uid()) as mine
                 from public.activity_reactions ar
                where ar.activity_id = e.id
                group by ar.emoji
             ) r
         ), '[]'::jsonb)
    from public.activity_events e
    left join public.profiles pr on pr.id = e.actor_id
   where e.entity_type = 'fulfillment_client'
     and e.entity_id = p_client::text
     and (e.action ilike '%comment%' or e.action ilike '%note%'
          or e.action ilike '%imported%' or e.action ilike '%clickup%')
     and public.entity_visible('fulfillment_client', p_client::text)
     and exists (select 1 from public.fulfillment_clients fc
                  where fc.id = p_client and public.can_see_partner(fc.outsourcing_group_id))
   order by e.created_at asc
$function$;

revoke execute on function public.client_posts(uuid) from public, anon;
grant execute on function public.client_posts(uuid) to authenticated;

comment on function public.client_posts(uuid) is
  'The conversation on a client file — notes and imported ClickUp comments, '
  'with their replies and aggregated reactions. History stays separate '
  '(Dee, 2026-09-23: ClickUp-style commenting).';

/**
 * Add or remove my reaction. One call, because a toggle that needs the caller
 * to know whether they already reacted races with itself the moment two
 * people press the same emoji.
 */
create or replace function public.activity_react(p_activity bigint, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_on boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_emoji is null or length(btrim(p_emoji)) = 0 or length(p_emoji) > 16 then
    raise exception 'That is not an emoji' using errcode = '22023';
  end if;

  /* You may react to what you may READ. The row policy on activity_events is
     the authority; this function does not widen it. */
  if not exists (select 1 from public.activity_events e where e.id = p_activity) then
    raise exception 'No such post' using errcode = '22023';
  end if;

  delete from public.activity_reactions
   where activity_id = p_activity and user_id = auth.uid() and emoji = p_emoji;
  if found then return false; end if;

  insert into public.activity_reactions (activity_id, user_id, emoji)
  values (p_activity, auth.uid(), p_emoji);
  return true;
end $function$;

revoke execute on function public.activity_react(bigint, text) from public, anon;
grant execute on function public.activity_react(bigint, text) to authenticated;

commit;
