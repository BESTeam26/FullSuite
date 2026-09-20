-- The invite wizard (Dee's mockup, 2026-09-20) collects the person's whole
-- placement before the invitation goes out: start date, position, engagement
-- type, phone, and the management seat their responsibility implies. Those
-- are staged on the invitation and applied by accept_agency_invitation.
--
-- invitation_onboarding is readable by no role at all, so staging needs a
-- writer: administrators only, one invitation at a time, and only the keys
-- the applier knows. An unknown key is dropped rather than stored, so a
-- future payload cannot smuggle anything past apply_invitation_onboarding.
create or replace function public.stage_invitation_onboarding(p_invitation uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $function$
declare i public.invitations%rowtype; v_clean jsonb;
begin
  select * into i from public.invitations where id = p_invitation and kind = 'agency';
  if i.id is null then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  if not public.is_admin_of(i.agency_id) then
    raise exception 'Only an administrator may stage an invitation' using errcode = '42501';
  end if;
  if i.accepted_at is not null then
    raise exception 'That invitation has already been accepted' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_clean
    from jsonb_each(coalesce(p_payload, '{}'::jsonb))
   where key in ('hired_on', 'job_title', 'engagement_type', 'phone', 'grants', 'seats', 'private', 'payout');
  insert into public.invitation_onboarding (invitation_id, payload, created_by)
  values (p_invitation, v_clean, auth.uid())
  on conflict (invitation_id) do update set payload = public.invitation_onboarding.payload || excluded.payload, created_by = excluded.created_by;
end $function$;
revoke all on function public.stage_invitation_onboarding(uuid, jsonb) from public, anon;
grant execute on function public.stage_invitation_onboarding(uuid, jsonb) to authenticated;
