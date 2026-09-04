-- =============================================================================
-- Fix `dev_seed_user`: GoTrue could not read the accounts it created
--
-- Sign-in returned 500 "Database error querying schema". GoTrue reads several
-- auth.users token columns into non-nullable Go strings — `confirmation_token`,
-- `recovery_token`, `email_change`, `email_change_token_new` and friends. They
-- default to NULL, and a NULL there fails the scan before any password is even
-- compared, so the account existed but could never log in.
--
-- Empty string is what GoTrue writes itself for "no token outstanding".
-- Existing seeded rows are repaired in the same pass.
-- =============================================================================

create or replace function public.dev_seed_user(
  p_email     text,
  p_password  text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
begin
  if p_email !~ '@bes\.test$' then
    raise exception 'dev_seed_user only creates @bes.test accounts, got %', p_email
      using errcode = '42501';
  end if;

  select id into v_id from auth.users where email = p_email;

  if v_id is null then
    v_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- Empty, not NULL: GoTrue scans these into non-nullable strings.
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', p_email,
                         'email_verified', true, 'phone_verified', false),
      now(), now(), now()
    );
  end if;

  update public.profiles
     set full_name = p_full_name, updated_at = now()
   where id = v_id;

  return v_id;
end $$;

revoke all on function public.dev_seed_user(text, text, text) from public, anon, authenticated;

-- Repair anything already seeded with NULL tokens. Scoped to the test domain so
-- it cannot touch a real account.
update auth.users
   set confirmation_token          = coalesce(confirmation_token, ''),
       recovery_token              = coalesce(recovery_token, ''),
       email_change                = coalesce(email_change, ''),
       email_change_token_new      = coalesce(email_change_token_new, ''),
       email_change_token_current  = coalesce(email_change_token_current, ''),
       phone_change                = coalesce(phone_change, ''),
       phone_change_token          = coalesce(phone_change_token, ''),
       reauthentication_token      = coalesce(reauthentication_token, '')
 where email like '%@bes.test';
