-- A person can be found even when they have no CreditOps work file.
--
-- Kevin Hernandez's import created 20 of 27 clients and then refused six with
-- "duplicate key value violates unique constraint clients_one_email_per_
-- partner", and left one with a foreign key error. All seven are people who
-- already existed.
--
-- ── WHY THEY WERE INVISIBLE ───────────────────────────────────────────────
--
-- `client_match_for_import` looks for a person by joining `clients` THROUGH
-- `fulfillment_clients`. So it can only find somebody who still has a
-- CreditOps work file. Eighteen canonical people have none — most of them
-- because the pilot clear on 2026-09-23 deleted every non-fixture work file
-- and left the people behind. My migration; it never touched `clients`.
--
-- For those, the import asks "is this person here?", is told no, tries to
-- create them, and is refused by the unique index on (partner, email). The
-- card imports as nothing at all.
--
-- ── WHY THIS IS NOT FIXED BY DELETING THEM ────────────────────────────────
--
-- The canonical client IS the person — "one Client identity, many services"
-- (client record doctrine). Of the eighteen, three have a FundingOps file,
-- one has a portal login and six hold secrets in the vault, including SSNs.
-- Deleting a person to make room for a re-import would throw away an SSN
-- somebody keyed in, to solve a lookup problem.
--
-- So the import finds them instead, and gives them a new work file. A client
-- whose CreditOps file was cleared and who comes back in a re-import keeps
-- their identity, their vault entries and their history.
--
-- Matching is the SAME order and the same rules as the work-file matcher,
-- including the name guard from this morning: a shared email does not merge
-- two different people.
--
-- Cost impact: no material increase — one indexed lookup, only on the path
-- where no work file was found.

begin;

create or replace function public.client_person_for_import(
  p_group uuid,
  p_email text,
  p_phone text,
  p_full_name text,
  p_dob date
) returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_n int;
begin
  -- Email.
  if p_email is not null and btrim(p_email) <> '' then
    select count(*), (array_agg(c.id))[1] into v_n, v_id from public.clients c
     where c.outsourcing_group_id = p_group
       and lower(c.email::text) = lower(btrim(p_email))
       and public.names_are_compatible(c.full_name, p_full_name);
    if v_n = 1 then return v_id; end if;
  end if;

  -- Phone, on digits so formatting cannot hide a match.
  if p_phone is not null and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10 then
    select count(*), (array_agg(c.id))[1] into v_n, v_id from public.clients c
     where c.outsourcing_group_id = p_group
       and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
           = regexp_replace(p_phone, '\D', '', 'g')
       and public.names_are_compatible(c.full_name, p_full_name);
    if v_n = 1 then return v_id; end if;
  end if;

  -- Name AND date of birth. Never name alone.
  if p_full_name is not null and p_dob is not null then
    select count(*), (array_agg(c.id))[1] into v_n, v_id from public.clients c
     where c.outsourcing_group_id = p_group
       and lower(btrim(c.full_name)) = lower(btrim(p_full_name))
       and c.date_of_birth = p_dob;
    if v_n = 1 then return v_id; end if;
  end if;

  return null;
end $function$;

comment on function public.client_person_for_import(uuid, text, text, text, date) is
  'The canonical person for an imported card, found WITHOUT requiring a '
  'CreditOps work file — so somebody whose file was cleared is given a new '
  'one rather than refused by the unique email index (2026-09-25).';

/* And the importer asks it, on the one path where it used to give up. */
do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
  v_anchor constant text :=
E'  if v_client is null then\n    v_created := true;\n    v_client := gen_random_uuid();';
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'clickup_import_client is not the shape this migration expects';
  end if;

  v_new := replace(v_def, v_anchor,
E'  /* No work file, but the PERSON may still be here — cleared CreditOps\n'
'     file, FundingOps-only, or a directory entry. Attaching a new work file\n'
'     to them keeps their vault entries and their history; creating a second\n'
'     person would be refused by the unique email index anyway, which is how\n'
'     seven of Kevin Hernandez''s cards imported as nothing (2026-09-25). */\n'
'  if v_client is null then\n'
'    v_client := public.client_person_for_import(\n'
'      v_group, p->>''email'', p->>''phone'', p->>''full_name'', nullif(p->>''dob'','''')::date);\n'
'  end if;\n\n'
'  if v_client is null then\n    v_created := true;\n    v_client := gen_random_uuid();');

  execute v_new;
end $$;

commit;
