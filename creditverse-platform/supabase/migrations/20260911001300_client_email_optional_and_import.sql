-- =============================================================================
-- A CreditOps client may have no email, and the importer that relies on it.
--
-- Dee, 2026-09-11: "Relax clients.email from NOT NULL. Do not invent an email
-- and do not make me manually supply one just to satisfy the schema. CreditOps
-- can legitimately have a client with no email."
--
-- Thania Ramirez Calix is the case: her ClickUp card is empty and her only
-- data is three photographs of documents. She is a real client BES is working.
--
-- ── THE OBLIGATION THAT COMES WITH IT ──────────────────────────────────────
--
-- Email was doing two jobs: a contact detail and the thing that stopped two
-- imports creating two of the same person. Dropping the constraint drops the
-- second job unless something replaces it, and a nullable column silently
-- weakening duplicate prevention is exactly how a migration goes wrong.
--
-- So the match becomes an ordered ladder, strongest first, and the strongest
-- rung is not email at all:
--
--   1. the ClickUp task id, through `import_links` — deterministic, and the
--      only rung that is true by construction rather than by inference;
--   2. the legacy client id from the previous system, within this partner;
--   3. exact email within this partner;
--   4. exact phone within this partner;
--   5. full name AND date of birth within this partner.
--
-- Name alone is never a match — Dee ruled that at the start and it is the rung
-- that would actually merge two different people.
-- =============================================================================

alter table public.clients alter column email drop not null;

comment on column public.clients.email is
  'Optional. A CreditOps client can be real and have no email — the ClickUp pilot has one (Dee, 2026-09-11). Identity is held by the match ladder in client_match_for_import(), not by this column.';

/**
 * Which existing client this import is about, if any.
 *
 * Returns the `fulfillment_clients` id, or null for a genuinely new person.
 * Each rung is tried in order and the first hit wins; a rung that would match
 * more than one row is treated as no match, because two candidates is a
 * question for a human and not a coin toss.
 */
create or replace function public.client_match_for_import(
  p_group uuid, p_source_system text, p_task_id text,
  p_legacy_id text, p_email text, p_phone text,
  p_full_name text, p_dob date)
returns uuid
language plpgsql stable security definer set search_path = public as $function$
declare v_id uuid; v_n int;
begin
  -- 1. The task id. True by construction: we recorded it last time.
  select entity_id::uuid into v_id from public.import_links
   where source_system = p_source_system and source_kind = 'task'
     and source_id = p_task_id and entity_type = 'fulfillment_client';
  if v_id is not null then return v_id; end if;

  -- 2. The legacy id, scoped to this partner.
  if p_legacy_id is not null then
    select count(*), min(fc.id) into v_n, v_id from public.fulfillment_clients fc
     where fc.outsourcing_group_id = p_group and fc.legacy_client_id = p_legacy_id;
    if v_n = 1 then return v_id; end if;
  end if;

  -- 3. Email.
  if p_email is not null and btrim(p_email) <> '' then
    select count(*), min(fc.id) into v_n, v_id
      from public.fulfillment_clients fc join public.clients c on c.id = fc.client_id
     where fc.outsourcing_group_id = p_group and lower(c.email::text) = lower(btrim(p_email));
    if v_n = 1 then return v_id; end if;
  end if;

  -- 4. Phone, compared on digits so formatting cannot hide a match.
  if p_phone is not null and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10 then
    select count(*), min(fc.id) into v_n, v_id
      from public.fulfillment_clients fc join public.clients c on c.id = fc.client_id
     where fc.outsourcing_group_id = p_group
       and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
           = regexp_replace(p_phone, '\D', '', 'g');
    if v_n = 1 then return v_id; end if;
  end if;

  -- 5. Name AND date of birth. Never name alone.
  if p_full_name is not null and p_dob is not null then
    select count(*), min(fc.id) into v_n, v_id
      from public.fulfillment_clients fc join public.clients c on c.id = fc.client_id
     where fc.outsourcing_group_id = p_group
       and lower(btrim(c.full_name)) = lower(btrim(p_full_name))
       and c.date_of_birth = p_dob;
    if v_n = 1 then return v_id; end if;
  end if;

  return null;
end $function$;
revoke execute on function public.client_match_for_import(uuid, text, text, text, text, text, text, date) from public, anon;
grant execute on function public.client_match_for_import(uuid, text, text, text, text, text, text, date) to authenticated;
