-- 0095 — cast the provenance in link_engine_record_to_client().
--
-- The CASE arms are untyped literals, so Postgres hands the insert `text`
-- where `client_provenance` is wanted and refuses it. The backfill (0092) had
-- the same expression with an explicit cast and worked; the trigger copy lost
-- it. Same for `status`.

create or replace function public.link_engine_record_to_client()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_split  record;
begin
  if new.client_id is not null then
    return new;
  end if;

  select id into v_client
    from public.clients
   where partner_scope_id = coalesce(new.organization_id, new.outsourcing_group_id)
     and lower(email::text) = lower(new.email::text);

  if v_client is null then
    select * into v_split from public.split_person_name(new.name);
    insert into public.clients
      (agency_id, organization_id, outsourcing_group_id, mode, first_name, last_name,
       email, phone, status, provenance, needs_review, review_note, created_by)
    values
      (new.agency_id, new.organization_id, new.outsourcing_group_id, new.mode,
       v_split.given_name, coalesce(v_split.surname, '(name not given)'),
       new.email, new.phone, 'active'::public.client_status,
       (case when new.mode = 'outsourcing_only' then 'outsourcing_only' else 'saas_pulled' end)::public.client_provenance,
       not v_split.clean,
       case when not v_split.clean then 'Created from a single-word name; check the given name and surname.' end,
       coalesce(new.created_by, auth.uid()))
    returning id into v_client;
  end if;

  new.client_id := v_client;
  return new;
end $$;
