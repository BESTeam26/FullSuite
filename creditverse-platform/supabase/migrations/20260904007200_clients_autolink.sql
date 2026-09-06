-- 0094 — the Client as an organization asset. Step 3 of 5: every writer links.
--
-- Making `client_id` required (0092) immediately broke `handoff_to_creditops`,
-- which creates a CreditOps record and knew nothing about clients. So does
-- every other path that creates a credit case or a funding record: the app's
-- own inserts, the GHL bridge, an import.
--
-- Updating each writer would work and would be wrong. There would be five
-- copies of "find or create the person", they would drift, and the sixth
-- writer somebody adds next month would forget. The rule belongs in one place:
--
--   A credit case or a funding record is always ABOUT somebody.
--   If the writer did not name them, resolve or create them here.
--
-- Resolution is the identity rule both engines already enforce with a unique
-- index — `(partner_scope_id, lower(email))`. So when the person already
-- exists this LINKS rather than duplicates, and it is not a guess: it is the
-- same key the database has always treated as one person per partner. Nothing
-- is ever matched on a name (rule 4).

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
       new.email, new.phone, 'active',
       case when new.mode = 'outsourcing_only' then 'outsourcing_only' else 'saas_pulled' end,
       not v_split.clean,
       case when not v_split.clean then 'Created from a single-word name; check the given name and surname.' end,
       coalesce(new.created_by, auth.uid()))
    returning id into v_client;
  end if;

  new.client_id := v_client;
  return new;
end $$;
revoke all on function public.link_engine_record_to_client() from public, anon, authenticated;

comment on function public.link_engine_record_to_client() is
  'Before a credit case or funding record is written, make sure it is about a client: the existing one for this partner and email, or a new one.';

create trigger fulfillment_clients_link_client before insert on public.fulfillment_clients
  for each row execute function public.link_engine_record_to_client();
create trigger funding_clients_link_client before insert on public.funding_clients
  for each row execute function public.link_engine_record_to_client();

-- ---------------------------------------------------------------------------
-- The other half: while both shapes exist, a contact detail edited on an
-- engine record must not silently disagree with the client. Until step 5 drops
-- those columns, the client is the one that carries forward.
--
-- Deliberately one-directional and narrow. Only name, email and phone; only
-- when they actually changed; and the client's row is the destination, never
-- the source, so there is one answer to "what is this person's number" the
-- moment anybody edits it (rule 2).
-- ---------------------------------------------------------------------------
create or replace function public.sync_client_identity_from_engine()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_split record;
begin
  if new.client_id is null then return new; end if;
  if new.name is not distinct from old.name
     and new.email is not distinct from old.email
     and new.phone is not distinct from old.phone then
    return new;
  end if;
  select * into v_split from public.split_person_name(new.name);
  update public.clients
     set first_name = case when v_split.clean then v_split.given_name else first_name end,
         last_name  = coalesce(v_split.surname, last_name),
         email      = new.email,
         phone      = coalesce(new.phone, phone)
   where id = new.client_id;
  return new;
end $$;
revoke all on function public.sync_client_identity_from_engine() from public, anon, authenticated;

create trigger fulfillment_clients_sync_identity after update of name, email, phone on public.fulfillment_clients
  for each row execute function public.sync_client_identity_from_engine();
create trigger funding_clients_sync_identity after update of name, email, phone on public.funding_clients
  for each row execute function public.sync_client_identity_from_engine();
