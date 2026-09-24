-- The feed hides withdrawn comments, and says which ones you may change.
--
-- Two additions to `client_feed`, both for the edit and delete controls Dee
-- asked for:
--
--   deleted comments are gone from the conversation entirely
--   every comment says whether THIS reader may edit or withdraw it
--
-- The second belongs in the query rather than in the browser. The rule is
-- "your own comment, or a manager's" — and working that out in TypeScript
-- means a second copy of `is_manager_of`, which is how a screen ends up
-- offering a control the database then refuses. Asked once, here, of the same
-- functions `note_edit` enforces with.
--
-- A withdrawn comment's REPLIES are already withdrawn with it by
-- `note_delete`, so nothing is left dangling under a parent that has gone.
--
-- Cost impact: no material increase.

begin;

/* Two columns are being ADDED to the result, and Postgres will not widen a
   `returns table` in place — 42P13, "row type defined by OUT parameters is
   different". Dropped and recreated inside the transaction, so nothing ever
   sees the function missing. */
drop function if exists public.client_feed(uuid);

create function public.client_feed(p_client uuid)
returns table (
  kind text,
  activity_id bigint,
  parent_id bigint,
  happened_at timestamptz,
  actor text,
  actor_id uuid,
  title text,
  detail text,
  imported boolean,
  reactions jsonb,
  file jsonb,
  edited boolean,
  mine boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with allowed as (
    select fc.id, fc.agency_id
      from public.fulfillment_clients fc
     where fc.id = p_client
       and public.entity_visible('fulfillment_client', p_client::text)
       and public.can_see_partner(fc.outsourcing_group_id)
  ),
  events as (
    select e.id, e.parent_id, e.created_at, e.action, e.detail, e.actor_id,
           e.field, e.edited_at, e.agency_id,
           coalesce(pr.full_name, pr.email, e.actor_name, 'BES') as actor
      from public.activity_events e
      left join public.profiles pr on pr.id = e.actor_id
     where exists (select 1 from allowed)
       and e.entity_type = 'fulfillment_client'
       and e.entity_id = p_client::text
       and e.action not like '[DEPARTMENT_PROGRESS]%'
       /* Withdrawn: out of the conversation, still in the table. */
       and e.deleted_at is null
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
    null::jsonb,
    v.edited_at is not null,
    /* The same test `note_edit` enforces, asked here so the screen cannot
       offer a control the database will refuse. A system event — anything
       with a `field` — is nobody's to change. */
    (v.field is null
     and (v.actor_id = auth.uid() or public.is_manager_of(v.agency_id)))
  from events v

  union all

  select 'work', null::bigint, null::bigint, pl.created_at,
         coalesce(pr.full_name, pr.email, 'BES'), pl.employee_id,
         'Completed ' || coalesce(pl.department_key, 'CreditOps') || ' work',
         public.clean_history_text(
           coalesce((select string_agg('✓ ' || a, E'\n') from unnest(pl.actions) as a), '')
           || case when pl.work_notes is not null and btrim(pl.work_notes) <> ''
                   then E'\n\n' || pl.work_notes else '' end),
         false, '[]'::jsonb, null::jsonb, false, false
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
                            'bucket', f.bucket, 'mime', f.mime_type, 'size', f.size_bytes),
         false, false
    from public.files f
    left join public.profiles pr on pr.id = f.uploaded_by
   where exists (select 1 from allowed)
     and f.entity_type = 'fulfillment_client' and f.entity_id = p_client::text

  order by 4 desc
$function$;

revoke execute on function public.client_feed(uuid) from public, anon;
grant execute on function public.client_feed(uuid) to authenticated;

comment on function public.client_feed(uuid) is
  'The Activity column: comments with replies, reactions and whether THIS '
  'reader may change them, plus completed work, system changes and files. '
  'Withdrawn comments are excluded (Dee, 2026-09-24).';

commit;
