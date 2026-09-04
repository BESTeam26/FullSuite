-- =============================================================================
-- Development test-data helper
--
-- Creates sign-in-able test users so the application can be exercised through
-- real Auth, RLS, permissions, entitlements and fulfillment engagements rather
-- than frontend placeholder arrays.
--
-- DEVELOPMENT ONLY. Every account it creates uses the reserved `@bes.test`
-- domain, which is not deliverable mail and cannot collide with a real person.
-- Nothing here touches a record it did not create.
--
-- Idempotent by email: running it again updates the profile name and leaves the
-- existing account, its id and its password alone. No deletes, ever — a seed
-- script that removes rows is one bad WHERE clause away from destroying real
-- work (rule 11).
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
  -- Refuse anything outside the test domain. This function can write to the
  -- auth schema, so it must not be usable against a real account.
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
      created_at, updated_at
    ) values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      -- Pre-confirmed: there is no inbox to click a link in.
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name),
      now(), now()
    );

    -- GoTrue matches a password login against an identity row, not just the
    -- user row. Without this the account exists but cannot sign in.
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

  -- `handle_new_user` creates the profile on insert; this keeps the display
  -- name current on a re-run without disturbing anything else.
  update public.profiles
     set full_name = p_full_name, updated_at = now()
   where id = v_id;

  return v_id;
end $$;

-- Never reachable from the browser. This writes to the auth schema.
revoke all on function public.dev_seed_user(text, text, text) from public, anon, authenticated;

comment on function public.dev_seed_user(text, text, text) is
  'DEVELOPMENT ONLY. Creates a sign-in-able @bes.test account. Drop this '
  'function and the dev seed migrations before any production deployment.';
