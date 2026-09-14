-- 0351 — record that an invitation email actually left.
--
-- ---------------------------------------------------------------------------
-- A BLIND SPOT FOUND DURING ACTIVATION
--
-- `agency_invitation.sent` is logged by `invite_agency_member()`, the function
-- that CREATES an invitation. Despite the name it means "an invitation
-- exists", not "an email went out". The `send-invitation` Edge Function — the
-- one that actually sends — recorded nothing at all.
--
-- So when Dee pressed Send and then Resend on fourteen invitations, there was
-- no way to tell from the data whether a single email had left. I read the
-- creation rows as send rows and told her nothing had been sent, which was not
-- something the data supported. This closes the gap that made that mistake
-- possible.
--
-- SECURITY DEFINER because `log_audit` is deliberately revoked from every
-- client role (0004: a caller with no membership wrote an arbitrary audit row).
-- This is the narrow, checked door: it writes ONE fixed action, about an
-- invitation the caller can already see, and nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.log_invitation_emailed(p_invitation uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare v_email text; v_kind text;
begin
  /* Readable by the caller under their own RLS — so somebody who cannot see
     the invitation cannot record anything about it. */
  select i.email::text, i.kind::text into v_email, v_kind
    from public.invitations i where i.id = p_invitation;
  if v_email is null then
    raise exception 'No such invitation' using errcode = '42501';
  end if;

  insert into public.audit_log (
    actor_id, agency_id, organization_id, action, entity_type, entity_id, after)
  select auth.uid(),
         (select m.agency_id from public.agency_memberships m
           where m.user_id = auth.uid() and m.status = 'active' limit 1),
         (select i.organization_id from public.invitations i where i.id = p_invitation),
         'invitation.emailed', 'invitation', p_invitation::text,
         jsonb_build_object('email', v_email, 'kind', v_kind);
end;
$function$;
revoke execute on function public.log_invitation_emailed(uuid) from public, anon;
grant execute on function public.log_invitation_emailed(uuid) to authenticated;

comment on function public.log_invitation_emailed(uuid) is
  'Records that an invitation email actually left, from the sender''s own session. Distinct from agency_invitation.sent, which despite its name is written when an invitation is CREATED (0351).';
