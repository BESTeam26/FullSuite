-- Migrate the people who were already invited into canonical Team Members
-- (Dee, 2026-09-20: "Migrate current pending invitations into Team Member
-- records before launch"). Their identity, placement and seats were already
-- staged on the invitation; this promotes that staging into the real records
-- so People & Teams is the source of truth tomorrow morning.
--
-- Five of the eight have no auth row yet, so a SHELL one is created here:
-- no password, unconfirmed, cannot sign in. That is the same thing
-- create-team-member does for a new invitation — written in SQL because this
-- migration runs without a browser session. The profile row follows from the
-- existing on_auth_user_created trigger.
--
-- Tokens are untouched: nobody is re-invited, nothing is re-sent, and the
-- links already in their inboxes keep working.

/* Allyssa's seats were staged against "Support & Onboarding", which the org
   chart work renamed back to "Onboarding" — corrected here so her placement
   lands rather than being skipped. */
update public.invitation_onboarding o
   set payload = jsonb_set(payload, '{seats}', '[{"seat":"department_manager","department":"Onboarding"},{"seat":"department_manager","department":"Client Success"}]'::jsonb)
  from public.invitations i
 where i.id = o.invitation_id and i.email = 'alyssamores.bes@gmail.com'::extensions.citext and i.accepted_at is null;

do $$
declare r record; v_user uuid; v_member uuid; v_division uuid; v_department uuid; s jsonb; k text;
begin
  for r in
    select i.id, i.email, i.full_name, i.agency_id, i.agency_role, i.access_profile, i.team_id, i.lead_team_id,
           coalesce(i.module_keys, '{}') as module_keys, o.payload
      from public.invitations i
      left join public.invitation_onboarding o on o.invitation_id = i.id
     where i.kind = 'agency' and i.accepted_at is null and i.expires_at > now()
     order by i.created_at
  loop
    select u.id into v_user from auth.users u where lower(u.email) = lower(r.email::text) limit 1;
    if v_user is null then
      v_user := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower(r.email::text),
              jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
              jsonb_build_object('full_name', r.full_name), now(), now());
    end if;

    insert into public.profiles (id, email, full_name)
    values (v_user, lower(r.email::text), r.full_name)
    on conflict (id) do update set full_name = coalesce(public.profiles.full_name, excluded.full_name);

    insert into public.agency_memberships
          (user_id, agency_id, role, access_profile, status, hired_on, job_title, engagement_type, primary_team_id)
    values (v_user, r.agency_id, r.agency_role, r.access_profile, 'invited',
            (r.payload->>'hired_on')::date, nullif(r.payload->>'job_title', ''), nullif(r.payload->>'engagement_type', ''), r.team_id)
    on conflict (user_id, agency_id) do update
      set status = case when public.agency_memberships.status = 'active' then 'active' else 'invited' end,
          hired_on = coalesce(public.agency_memberships.hired_on, excluded.hired_on)
    returning id into v_member;

    if r.payload ? 'phone' then
      update public.profiles set phone = coalesce(phone, r.payload->>'phone') where id = v_user;
    end if;

    if r.team_id is not null and exists (select 1 from public.teams t where t.id = r.team_id and t.archived_at is null) then
      insert into public.team_memberships (team_id, user_id, is_lead)
      values (r.team_id, v_user, r.lead_team_id is not distinct from r.team_id)
      on conflict (team_id, user_id) do update set is_lead = public.team_memberships.is_lead or excluded.is_lead;
    end if;

    /* A seat whose division or department has since been renamed cannot be
       placed by name — it is skipped and raised as a notice rather than
       failing the launch migration or, worse, creating a seat with no scope. */
    for s in select * from jsonb_array_elements(coalesce(r.payload->'seats', '[]'::jsonb)) loop
      v_division := (select id from public.divisions where agency_id = r.agency_id and name = s->>'division' and archived_at is null);
      v_department := (select id from public.departments where agency_id = r.agency_id and name = s->>'department' and archived_at is null);
      if (s->>'seat' = 'chief_operations')
         or (s->>'seat' = 'division_manager' and v_division is not null)
         or (s->>'seat' = 'department_manager' and v_department is not null) then
        insert into public.management_seats (agency_id, user_id, seat, division_id, department_id, effective_from, reason)
        select r.agency_id, v_user, s->>'seat', v_division, v_department,
               coalesce((r.payload->>'hired_on')::date, current_date), 'Staged on the invitation, applied at launch'
         where not exists (select 1 from public.management_seats ms
                            where ms.user_id = v_user and ms.seat = s->>'seat' and ms.effective_to is null
                              and ms.division_id is not distinct from v_division
                              and ms.department_id is not distinct from v_department);
      else
        raise notice 'Seat % for % not placed: % not found', s->>'seat', r.email, coalesce(s->>'department', s->>'division');
      end if;
    end loop;

    foreach k in array r.module_keys loop
      if exists (select 1 from public.permission_keys pk where pk.key = k) then
        insert into public.agency_member_permissions (membership_id, key, allowed)
        values (v_member, k, true) on conflict (membership_id, key) do update set allowed = true;
      end if;
    end loop;

    foreach k in array coalesce(array(select jsonb_array_elements_text(r.payload->'grants')), '{}') loop
      if exists (select 1 from public.permission_keys pk where pk.key = k) then
        insert into public.agency_member_permissions (membership_id, key, allowed)
        values (v_member, k, true) on conflict (membership_id, key) do update set allowed = true;
      end if;
    end loop;

    update public.invitations set membership_id = v_member where id = r.id;
  end loop;
end $$;
