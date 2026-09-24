-- One feed for the Activity column, with everything it has to show.
--
-- Dee's mockup has filters — All · Work · Comments · Files · System — over a
-- single stream grouped by day. The column could only show comments, because
-- `client_posts()` returns notes and nothing else, and `client_history()`
-- returns everything but carries no id, so nothing in it can be replied to or
-- reacted to.
--
-- `client_feed()` is the one stream the column needs: comments with their
-- replies and reactions, completed work, the system changes, and the files —
-- each tagged with which filter it belongs to.
--
-- ── WHY FILES ARE ROWS IN THE FEED ────────────────────────────────────────
--
-- Her mockup shows "Attached Screenshot…png" as an entry with a thumbnail,
-- not as an icon inside a comment. That is also the only honest shape
-- available: the import recorded which COMMENT it wrote and which FILE it
-- stored, never that a particular attachment arrived on a particular comment.
-- Inventing that link would mean guessing by timestamp. A file is its own
-- entry, dated and attributed, which is true.
--
-- ── ONE QUERY, NOT FOUR ───────────────────────────────────────────────────
--
-- The column filters in the browser over one fetch rather than refetching per
-- tab: the whole feed for one client is bounded and small, and four tabs that
-- each hit the network is the waterfall rule 14 forbids.
--
-- Cost impact: no material increase — it replaces the two queries the column
-- and the history tab were making with one.

begin;

create or replace function public.client_feed(p_client uuid)
returns table (
  kind text,              -- comment | work | system | file
  activity_id bigint,     -- null on a file row; what a reply or reaction needs
  parent_id bigint,
  happened_at timestamptz,
  actor text,
  actor_id uuid,
  title text,
  detail text,
  imported boolean,
  reactions jsonb,
  file jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with allowed as (
    /* The same gate `client_posts` uses: the record must be visible AND the
       caller must be able to see the partner holding it. Asked once. */
    select fc.id
      from public.fulfillment_clients fc
     where fc.id = p_client
       and public.entity_visible('fulfillment_client', p_client::text)
       and public.can_see_partner(fc.outsourcing_group_id)
  ),
  events as (
    select e.id, e.parent_id, e.created_at, e.action, e.detail, e.actor_id,
           coalesce(pr.full_name, pr.email, e.actor_name, 'BES') as actor
      from public.activity_events e
      left join public.profiles pr on pr.id = e.actor_id
     where exists (select 1 from allowed)
       and e.entity_type = 'fulfillment_client'
       and e.entity_id = p_client::text
       and e.action not like '[DEPARTMENT_PROGRESS]%'
  )
  select
    case
      when v.action in ('Internal note', 'Update posted', 'Comment posted', 'Imported from ClickUp')
        or v.action ilike '%comment%' or v.action ilike '%note%' or v.action ilike '%clickup%'
        then 'comment'
      when v.action ilike '%complet%' then 'work'
      else 'system'
    end,
    v.id, v.parent_id, v.created_at, v.actor, v.actor_id, v.action,
    public.clean_history_text(v.detail),
    (v.action ilike '%imported%' or v.action ilike '%clickup%'),
    coalesce((
      select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine)
             order by r.n desc, r.emoji)
        from (select ar.emoji, count(*)::int as n, bool_or(ar.user_id = auth.uid()) as mine
                from public.activity_reactions ar where ar.activity_id = v.id group by ar.emoji) r
    ), '[]'::jsonb),
    null::jsonb
  from events v

  union all

  /* Completed work, from production rather than from an event, so the feed
     says what was actually done and not merely that a status moved. */
  select 'work', null::bigint, null::bigint, pl.created_at,
         coalesce(pr.full_name, pr.email, 'BES'), pl.employee_id,
         'Completed ' || coalesce(pl.department_key, 'CreditOps') || ' work',
         public.clean_history_text(
           coalesce((select string_agg('✓ ' || a, E'\n') from unnest(pl.actions) as a), '')
           || case when pl.work_notes is not null and btrim(pl.work_notes) <> ''
                   then E'\n\n' || pl.work_notes else '' end),
         false, '[]'::jsonb, null::jsonb
    from public.production_logs pl
    left join public.profiles pr on pr.id = pl.employee_id
   where exists (select 1 from allowed) and pl.client_id = p_client and not pl.is_voided

  union all

  select 'file', null::bigint, null::bigint, f.created_at,
         coalesce(pr.full_name, pr.email, 'ClickUp'), f.uploaded_by,
         'Attached ' || f.name, null,
         f.uploaded_by is null,
         '[]'::jsonb,
         jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path,
                            'bucket', f.bucket, 'mime', f.mime_type, 'size', f.size_bytes)
    from public.files f
    left join public.profiles pr on pr.id = f.uploaded_by
   where exists (select 1 from allowed)
     and f.entity_type = 'fulfillment_client' and f.entity_id = p_client::text

  order by 4 desc
$function$;

revoke execute on function public.client_feed(uuid) from public, anon;
grant execute on function public.client_feed(uuid) to authenticated;

comment on function public.client_feed(uuid) is
  'The Activity column: comments with replies and reactions, completed work, '
  'system changes and files, each tagged with its filter, newest first '
  '(Dee, 2026-09-24).';

commit;
