-- A comment is a comment, whoever is allowed to see it.
--
-- Dee posted an update on a client and it did not appear in the Activity
-- column. It was written correctly. `client_posts()` then filtered it out.
--
-- The feed picked its rows by matching the action TEXT — anything containing
-- "comment", "note", "imported" or "clickup". The composer writes one of two
-- actions depending on a checkbox:
--
--   "Internal note"   when the update is BES-only        → contains "note" ✓
--   "Update posted"   when "Partner can see this" is on  → matches nothing ✗
--
-- So ticking the box made the comment vanish from the conversation it was
-- written into. The same trap hits "Comment posted" only by luck of the word.
--
-- Matching on the wording of an action is the mistake. The actions are a
-- known, small set, so they are named — and anything else that is genuinely a
-- note still falls through to the text match, so a writer this list has not
-- heard of is shown rather than silently dropped.
--
-- Cost impact: no material increase.

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
                    'emoji', r.emoji, 'count', r.n, 'mine', r.mine)
                  order by r.n desc, r.emoji)
             from (
               select ar.emoji, count(*)::int as n,
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
     and (
       /* The actions the composer and the importer actually write. */
       e.action in ('Internal note', 'Update posted', 'Comment posted',
                    'Imported from ClickUp')
       /* And a net for anything note-shaped this list has not met, so a new
          writer shows up in the conversation instead of disappearing from
          it — which is exactly what happened to "Update posted". */
       or e.action ilike '%comment%' or e.action ilike '%note%'
       or e.action ilike '%clickup%'
     )
     and public.entity_visible('fulfillment_client', p_client::text)
     and exists (select 1 from public.fulfillment_clients fc
                  where fc.id = p_client and public.can_see_partner(fc.outsourcing_group_id))
   order by e.created_at asc
$function$;

comment on function public.client_posts(uuid) is
  'The conversation on a client file — every note, update and imported '
  'ClickUp comment, with replies and aggregated reactions. Matches the '
  'actions by name, because matching their wording lost "Update posted" '
  '(Dee, 2026-09-24).';

commit;
