-- Search that finds more than message text.
--
-- Dee, 2026-09-16: *"Search should support messages, people, channels,
-- Partners, attachments. Results should jump directly to the
-- message/conversation."*
--
-- `search_messages` did one of those five. This is the union, with a `kind` so
-- the interface can group and a `channel_id` so every result knows where it
-- opens.
--
-- SECURITY INVOKER, deliberately and importantly. Five tables with five
-- different policies are being read at once; running as the invoker means each
-- one answers for itself, and I cannot get the composition wrong by restating
-- any of them here. A partner contact searching gets their own conversations
-- and nothing of the BES roster — not because this function checks who they
-- are, but because `profiles` and `outsourcing_groups` already refuse them.
--
-- That is also why there is no `is_agency_staff()` guard at the top: adding one
-- would be a SECOND opinion about access, and two opinions is how they start to
-- differ.

create or replace function public.search_communication(p_query text, p_limit integer default 40)
returns table (
  kind        text,
  ref_id      text,
  channel_id  uuid,
  title       text,
  subtitle    text,
  happened_at timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with q as (select trim(coalesce(p_query, '')) as term),
  /* Two characters is the floor the message search already used; below it the
     result set is everything and helps nobody. */
  ok as (select length(term) >= 2 as go, '%' || term || '%' as like_term from q),

  messages_hit as (
    select 'message'::text as kind, m.id::text as ref_id, m.channel_id,
           coalesce(nullif(trim(pr.full_name), ''), pr.email, 'Someone') as title,
           m.body_text as subtitle, m.created_at as happened_at
      from public.messages m
      join public.channels c on c.id = m.channel_id
      left join public.profiles pr on pr.id = m.author_id
      cross join ok
     where ok.go and m.deleted_at is null and m.body_text ilike ok.like_term
  ),

  channels_hit as (
    select 'channel'::text, c.id::text, c.id,
           c.name, coalesce(g.name, o.name, c.purpose), c.created_at
      from public.channels c
      left join public.outsourcing_groups g on g.id = c.partner_group_id
      left join public.organizations o on o.id = c.organization_id
      cross join ok
     where ok.go and c.archived_at is null and c.name ilike ok.like_term
  ),

  people_hit as (
    select 'person'::text, pr.id::text, null::uuid,
           coalesce(nullif(trim(pr.full_name), ''), pr.email), pr.email, pr.created_at
      from public.profiles pr cross join ok
     where ok.go
       and (pr.full_name ilike ok.like_term or pr.email ilike ok.like_term)
  ),

  partners_hit as (
    select 'partner'::text, g.id::text, null::uuid,
           g.name, g.lifecycle::text, g.created_at
      from public.outsourcing_groups g cross join ok
     where ok.go and g.archived_at is null and g.name ilike ok.like_term
  ),

  files_hit as (
    /* Attachments live on a message, so a file result opens the conversation
       it was shared in — which is what "jump directly to the message" means
       for something that is not itself a message. */
    select 'file'::text, f.id::text, m.channel_id,
           f.name, c.name, f.created_at
      from public.files f
      join public.messages m on m.id::text = f.entity_id and m.deleted_at is null
      join public.channels c on c.id = m.channel_id
      cross join ok
     where ok.go and f.entity_type = 'channel_message' and f.name ilike ok.like_term
  ),

  everything as (
    select * from messages_hit
    union all select * from channels_hit
    union all select * from people_hit
    union all select * from partners_hit
    union all select * from files_hit
  )
  select * from everything
   order by happened_at desc
   limit greatest(1, least(coalesce(p_limit, 40), 100))
$$;

comment on function public.search_communication(text, integer) is
  'Search across messages, channels, people, partners and attachments. SECURITY INVOKER: every table answers for itself, so a searcher finds exactly what they could already open.';

grant execute on function public.search_communication(text, integer) to authenticated;
