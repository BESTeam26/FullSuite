-- 0072 — Company intranet: announcements and knowledge articles
--
-- Proposed in PLATFORM_COMPLETION_PLAN.md §A.4 (O1). Two small tables so the
-- Announcements and Knowledge Base screens read real records instead of sample
-- content. Organization rows belong to the organization: only its members read
-- them, only members with settings.manage write them. BES-authored rows
-- (organization_id null) are either published to every organization
-- ("all_organizations" / knowledge shared to all) or kept BES-internal.
-- BES staff status grants no access to an organization's own rows (rule 16).
-- Writes go through SECURITY DEFINER functions with explicit checks and an
-- audit row; nothing is deleted — rows are archived.

create type public.announcement_audience as enum ('organization', 'all_organizations', 'bes_internal');
create type public.knowledge_audience as enum ('organization', 'consumer', 'both', 'bes_internal');

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  audience         public.announcement_audience not null default 'organization',
  title            text not null check (length(title) between 1 and 200),
  body             text not null check (length(body) between 1 and 20000),
  tag              text check (tag is null or length(tag) <= 40),
  pinned           boolean not null default false,
  published_at     timestamptz,
  archived_at      timestamptz,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint announcements_scope check (
    (organization_id is not null and audience = 'organization')
    or (organization_id is null and audience in ('all_organizations', 'bes_internal'))
  )
);
create index announcements_org_idx on public.announcements (organization_id, pinned desc, published_at desc) where archived_at is null;
create index announcements_bes_idx on public.announcements (audience, published_at desc) where organization_id is null and archived_at is null;
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements for select to authenticated
  using (
    archived_at is null and (
      -- an organization's own announcements: its members; drafts only for its admins
      (organization_id is not null and public.is_org_member(organization_id)
        and (published_at is not null or public.member_can(organization_id, 'settings.manage')))
      -- BES to every organization: any signed-in member once published; BES staff always
      or (organization_id is null and audience = 'all_organizations'
        and (published_at is not null or public.is_agency_staff()))
      -- BES internal: staff only
      or (organization_id is null and audience = 'bes_internal' and public.is_agency_staff())
    )
  );

-- ---------------------------------------------------------------------------
-- knowledge_articles
-- ---------------------------------------------------------------------------
create table public.knowledge_articles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  audience         public.knowledge_audience not null default 'organization',
  category         text check (category is null or length(category) <= 60),
  title            text not null check (length(title) between 1 and 200),
  body             text not null check (length(body) between 1 and 60000),
  sort             integer not null default 0,
  published_at     timestamptz,
  archived_at      timestamptz,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint knowledge_scope check (
    (organization_id is not null and audience in ('organization', 'consumer', 'both'))
    or (organization_id is null)
  )
);
create index knowledge_org_idx on public.knowledge_articles (organization_id, category, sort) where archived_at is null;
create index knowledge_bes_idx on public.knowledge_articles (audience, category, sort) where organization_id is null and archived_at is null;
create trigger knowledge_articles_updated_at before update on public.knowledge_articles
  for each row execute function public.set_updated_at();

alter table public.knowledge_articles enable row level security;

create policy knowledge_select on public.knowledge_articles for select to authenticated
  using (
    archived_at is null and (
      (organization_id is not null and public.is_org_member(organization_id)
        and (published_at is not null or public.member_can(organization_id, 'settings.manage')))
      -- BES library shared with every organization (audience organization/both/consumer)
      or (organization_id is null and audience <> 'bes_internal'
        and (published_at is not null or public.is_agency_staff()))
      or (organization_id is null and audience = 'bes_internal' and public.is_agency_staff())
    )
  );

-- ---------------------------------------------------------------------------
-- Writers: explicit checks, audit rows, archive instead of delete
-- ---------------------------------------------------------------------------
create or replace function public.intranet_may_write(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_org is null then public.is_agency_staff()
    else public.member_can(p_org, 'settings.manage')
  end
$$;
revoke all on function public.intranet_may_write(uuid) from public, anon;
grant execute on function public.intranet_may_write(uuid) to authenticated;

create or replace function public.save_announcement(
  p_id uuid, p_org uuid, p_audience text, p_title text, p_body text, p_tag text, p_pinned boolean, p_publish boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_row public.announcements;
  v_audience public.announcement_audience := p_audience::public.announcement_audience;
begin
  if not public.intranet_may_write(p_org) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.announcements (organization_id, audience, title, body, tag, pinned, published_at, created_by)
    values (p_org, v_audience, p_title, p_body, nullif(p_tag, ''), coalesce(p_pinned, false),
            case when p_publish then now() end, auth.uid())
    returning * into v_row;
  else
    select to_jsonb(a) into v_before from public.announcements a where a.id = p_id and a.organization_id is not distinct from p_org;
    if v_before is null then
      raise exception 'announcement not found' using errcode = 'P0002';
    end if;
    update public.announcements
       set title = p_title, body = p_body, tag = nullif(p_tag, ''), pinned = coalesce(p_pinned, false),
           published_at = case when p_publish then coalesce(published_at, now()) else null end
     where id = p_id
    returning * into v_row;
  end if;
  perform public.log_audit('announcement.saved', 'announcement', v_row.id::text, p_org, v_before, to_jsonb(v_row));
  return v_row.id;
end $$;
revoke all on function public.save_announcement(uuid, uuid, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.save_announcement(uuid, uuid, text, text, text, text, boolean, boolean) to authenticated;

create or replace function public.archive_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.announcements;
begin
  select * into v_row from public.announcements where id = p_id and archived_at is null;
  if v_row.id is null then
    raise exception 'announcement not found' using errcode = 'P0002';
  end if;
  if not public.intranet_may_write(v_row.organization_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.announcements set archived_at = now() where id = p_id;
  perform public.log_audit('announcement.archived', 'announcement', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
end $$;
revoke all on function public.archive_announcement(uuid) from public, anon;
grant execute on function public.archive_announcement(uuid) to authenticated;

create or replace function public.save_knowledge_article(
  p_id uuid, p_org uuid, p_audience text, p_category text, p_title text, p_body text, p_sort integer, p_publish boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_row public.knowledge_articles;
  v_audience public.knowledge_audience := p_audience::public.knowledge_audience;
begin
  if not public.intranet_may_write(p_org) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.knowledge_articles (organization_id, audience, category, title, body, sort, published_at, created_by)
    values (p_org, v_audience, nullif(p_category, ''), p_title, p_body, coalesce(p_sort, 0),
            case when p_publish then now() end, auth.uid())
    returning * into v_row;
  else
    select to_jsonb(k) into v_before from public.knowledge_articles k where k.id = p_id and k.organization_id is not distinct from p_org;
    if v_before is null then
      raise exception 'article not found' using errcode = 'P0002';
    end if;
    update public.knowledge_articles
       set audience = v_audience, category = nullif(p_category, ''), title = p_title, body = p_body, sort = coalesce(p_sort, 0),
           published_at = case when p_publish then coalesce(published_at, now()) else null end
     where id = p_id
    returning * into v_row;
  end if;
  perform public.log_audit('knowledge_article.saved', 'knowledge_article', v_row.id::text, p_org, v_before, to_jsonb(v_row));
  return v_row.id;
end $$;
revoke all on function public.save_knowledge_article(uuid, uuid, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_knowledge_article(uuid, uuid, text, text, text, text, integer, boolean) to authenticated;

create or replace function public.archive_knowledge_article(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.knowledge_articles;
begin
  select * into v_row from public.knowledge_articles where id = p_id and archived_at is null;
  if v_row.id is null then
    raise exception 'article not found' using errcode = 'P0002';
  end if;
  if not public.intranet_may_write(v_row.organization_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.knowledge_articles set archived_at = now() where id = p_id;
  perform public.log_audit('knowledge_article.archived', 'knowledge_article', p_id::text, v_row.organization_id, to_jsonb(v_row), null);
end $$;
revoke all on function public.archive_knowledge_article(uuid) from public, anon;
grant execute on function public.archive_knowledge_article(uuid) to authenticated;

-- Default privileges (0063) give authenticated SELECT only on new tables; the
-- functions above own every write. Anonymous callers get nothing.
revoke all on public.announcements, public.knowledge_articles from anon;
