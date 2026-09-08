----------------------------------------------------------------------
-- 0227  A first password is not a rotation.
--
-- `partner_credential_save` recorded 'rotated' whenever a secret was written,
-- including the moment the credential was created. So every entry began life
-- with a rotation it never had, and "has this login been changed since we
-- were given it?" — the question the record exists to answer after somebody
-- leaves — could not be answered by reading it.
--
-- 'created' now stands alone on creation; 'rotated' means a password that
-- existed was replaced. `last_rotated_at` is unchanged: it is still set when
-- the secret is first stored, because "the stored password dates from here"
-- is true then and is what a rotation schedule counts from.
--
-- Also corrects clearing a password, which recorded a rotation as though one
-- had been set. It records 'updated', which is what happened.
----------------------------------------------------------------------

create or replace function public.partner_credential_save(
  p_group            uuid,
  p_platform         text,
  p_label            text,
  p_username         text default null,
  p_url              text default null,
  p_secret           text default null,
  p_code_destination text default null,
  p_notes            text default null,
  p_rotation_due     date default null,
  p_id               uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency  uuid;
  v_id      uuid := p_id;
  v_secret  uuid;
  v_name    text;
  v_created boolean := p_id is null;
begin
  select agency_id into v_agency from public.outsourcing_groups where id = p_group;
  if v_agency is null then
    raise exception 'partner not found' using errcode = 'P0002';
  end if;
  if not (public.is_staff_of(v_agency)
          and public.agency_can('partners.credentials.manage')
          and public.can_see_partner(p_group)) then
    raise exception 'You may not change this partner''s credentials' using errcode = '42501';
  end if;
  /* The whole point of the table is that no password sits in the clear. A
     note holding one would put it straight back, so an obvious one is
     refused with an instruction rather than quietly stored. */
  if public.looks_like_a_secret(p_notes) then
    raise exception 'Put the password in the password field, not the notes. The notes are stored in the clear.'
      using errcode = '22023';
  end if;

  if v_created then
    insert into public.partner_credentials
      (agency_id, group_id, platform_key, label, username, url, code_destination, notes, rotation_due_on)
    values
      (v_agency, p_group, p_platform, p_label, p_username, p_url, p_code_destination, p_notes, p_rotation_due)
    returning id into v_id;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'created');
  else
    update public.partner_credentials
       set platform_key = p_platform, label = p_label, username = p_username, url = p_url,
           code_destination = p_code_destination, notes = p_notes, rotation_due_on = p_rotation_due
     where id = v_id and group_id = p_group
    returning secret_id into v_secret;
    if v_id is null or not found then
      raise exception 'credential not found' using errcode = 'P0002';
    end if;
    insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
    values (v_id, v_agency, auth.uid(), 'updated');
  end if;

  /* NULL means "leave the password alone" — editing a label must not wipe a
     credential. Empty means "there is no password here". Anything else
     replaces it. */
  if p_secret is not null then
    select secret_id into v_secret from public.partner_credentials where id = v_id;
    if length(p_secret) = 0 then
      update public.partner_credentials set secret_id = null where id = v_id;
      if not v_created then
        insert into public.partner_credential_events (credential_id, agency_id, actor_id, action, note)
        values (v_id, v_agency, auth.uid(), 'updated', 'password cleared');
      end if;
    elsif v_secret is null then
      /* The vault name is opaque on purpose: it appears in `vault.secrets`,
         which administrators can list, and a name like
         "DisputeFox — Credit Cure" would leak the inventory. */
      v_name := 'partner_credential:' || v_id::text;
      v_secret := vault.create_secret(p_secret, v_name, 'BES partner credential');
      update public.partner_credentials
         set secret_id = v_secret, last_rotated_at = now() where id = v_id;
      /* Storing the FIRST password is part of creating the entry, not a
         change to it. On an existing entry that had none, it is a change. */
      if not v_created then
        insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
        values (v_id, v_agency, auth.uid(), 'rotated');
      end if;
    else
      perform vault.update_secret(v_secret, p_secret, null, 'BES partner credential');
      update public.partner_credentials set last_rotated_at = now() where id = v_id;
      insert into public.partner_credential_events (credential_id, agency_id, actor_id, action)
      values (v_id, v_agency, auth.uid(), 'rotated');
    end if;
  end if;

  return v_id;
end $function$;

comment on function public.partner_credential_save(uuid, text, text, text, text, text, text, text, date, uuid) is
  'Creates or updates one partner credential, writing the secret to Supabase Vault and the audit row in the same transaction. A NULL password means "leave it alone" — editing a label must not silently wipe a credential. ''rotated'' means an existing password was replaced; creating an entry with one records ''created'' alone.';
