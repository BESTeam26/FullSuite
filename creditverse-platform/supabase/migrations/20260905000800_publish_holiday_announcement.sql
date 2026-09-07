-- 0149 — the holiday notice needs a writer, not an insert.
--
-- `announcements` has a SELECT policy and no INSERT policy, on purpose: every
-- write goes through `save_announcement()`, which is where the authorization
-- lives. My holiday publisher did a direct upsert, so it would have been
-- refused on every run — and because the caller swallows the error so a
-- missing notice never breaks somebody's Home page, it would have failed
-- SILENTLY. The team would simply never have been told about a holiday, and
-- nothing would have said why.
--
-- The matrix caught it before the team did.
--
-- `save_announcement` cannot be reused as it stands: it has no `source_key`,
-- so it cannot be idempotent, and an announcement generator that is not
-- idempotent sends "Upcoming U.S. Holiday: Thanksgiving" once per page load.
create or replace function public.publish_holiday_announcement(
  p_agency uuid,
  p_source_key text,
  p_title text,
  p_body text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_staff_of(p_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(trim(p_source_key), '') = '' then
    raise exception 'a generated announcement needs a source key' using errcode = '22023';
  end if;

  /* The unique index is PARTIAL (`where source_key is not null`), so the
     conflict target has to name the predicate too — inference against a
     partial index fails with 42P10 otherwise, which is exactly what the
     probe hit. */
  insert into public.announcements
    (organization_id, agency_id, audience, source_key, title, body, tag, published_at, created_by)
  values
    (null, p_agency, 'bes_internal', p_source_key, p_title, p_body, 'Holiday', now(), auth.uid())
  on conflict (source_key) where source_key is not null do nothing
  returning id into v_id;

  /* True when this call created it; false when it already existed. Running
     the generator twice is a no-op, and says so. */
  return v_id is not null;
end $$;
revoke execute on function public.publish_holiday_announcement(uuid, text, text, text) from public, anon;
grant execute on function public.publish_holiday_announcement(uuid, text, text, text) to authenticated;

comment on function public.publish_holiday_announcement(uuid, text, text, text) is
  'Publishes one generated holiday notice, once. Idempotent on source_key so the generator can run on every page load without repeating itself.';
