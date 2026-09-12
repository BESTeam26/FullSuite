-- =============================================================================
-- Portal access is a switch on the Partner, and it switches something real.
--
-- Dee, 2026-09-12: "Portal OFF blocks Partner Portal access, does not delete
-- the contact, does not delete identity/auth history, does not delete Partner
-- data, does not affect service engagements, does not affect CreditOps
-- operations."
--
-- ── WHY IT IS ENFORCED IN ONE FUNCTION ──────────────────────────────────────
--
-- `partner_group_of_user()` is the single chokepoint every partner-facing read
-- passes through: `is_partner_contact_of` calls it, the `partner_contacts`
-- policy calls that, and every `my_partner_*` function resolves through it. So
-- the flag is checked THERE and nowhere else. A toggle that only hides a
-- button is not access control (rule 1), and a toggle re-implemented in six
-- policies is five chances to miss one.
--
-- ── ACCESS STATE AND INVITATION STATE ARE DIFFERENT THINGS ──────────────────
--
-- Dee: "Keep access state and invitation state separate." Access is this
-- boolean on the partner. Invitation is the contact's own `invited_at` /
-- `activated_at` / `user_id`. A partner can be ON with nobody invited, ON with
-- an invitation pending, or OFF with somebody who accepted months ago — and
-- turning it back ON restores them without a new invitation, because nothing
-- about their identity was destroyed.
--
-- ── THE MIGRATION DESCRIBES WHAT IS ALREADY TRUE ────────────────────────────
--
-- Defaulting every existing partner to OFF would revoke access somebody
-- already has, silently, as a side effect of adding a column. Partners with a
-- contact who has already activated are set ON: the flag records reality
-- rather than imposing a new one. Everybody else starts OFF, which is what
-- they are.
-- =============================================================================

alter table public.outsourcing_groups
  add column if not exists portal_access_enabled boolean not null default false,
  add column if not exists portal_access_changed_by uuid references public.profiles(id),
  add column if not exists portal_access_changed_at timestamptz;

comment on column public.outsourcing_groups.portal_access_enabled is
  'Whether this partner''s contacts may enter the Partner Portal. Separate from the partner''s lifecycle and separate from whether anybody has been invited. Enforced in partner_group_of_user(), so turning it off ends access everywhere at once (Dee, 2026-09-12).';

/* Anybody already through the door keeps their key. */
update public.outsourcing_groups g
   set portal_access_enabled = true,
       portal_access_changed_at = now()
 where exists (
   select 1 from public.partner_contacts c
    where c.group_id = g.id and c.status = 'active' and c.user_id is not null
 );

-- ── The chokepoint ──────────────────────────────────────────────────────────
create or replace function public.partner_group_of_user()
returns uuid language sql stable security definer set search_path = public as $function$
  select c.group_id
    from public.partner_contacts c
    join public.outsourcing_groups g on g.id = c.group_id
   where c.user_id = auth.uid()
     and c.status = 'active'
     /* The switch. Off means off — for every policy, every my_partner_*
        function and every row, not just the navigation. */
     and g.portal_access_enabled
     and g.lifecycle not in ('suspended', 'archived')
   limit 1
$function$;

-- ── Is this partner even eligible? ──────────────────────────────────────────
/**
 * Dee, 2026-09-12: "The remaining 20 stay without portal access until a real
 * Primary Contact email is added… The Partner Profile should clearly show
 * Portal Access: Cannot Enable · Primary Contact Email Required."
 *
 * Derived, never stored: eligibility is a fact about the contact rows, and a
 * cached copy would be wrong the moment somebody adds an email.
 */
create or replace function public.partner_portal_eligible(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.partner_contacts c
     where c.group_id = p_group
       and c.status = 'active'
       and c.is_primary
       and c.email is not null
       and btrim(c.email) <> ''
       and c.email like '%_@_%.__%'
  )
$function$;
grant execute on function public.partner_portal_eligible(uuid) to authenticated;

-- ── Turning it on and off ───────────────────────────────────────────────────
create or replace function public.set_partner_portal_access(
  p_group uuid, p_enabled boolean, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  g public.outsourcing_groups%rowtype;
  v_actor text;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then
    raise exception 'Partner not visible' using errcode = '42501';
  end if;
  if not (public.is_manager_of(g.agency_id) and public.agency_can('partners.edit')) then
    raise exception 'Changing portal access requires the partners.edit capability'
      using errcode = '42501';
  end if;

  /* Turning it ON needs somebody to let in. Turning it OFF never does — a
     partner whose only contact was removed must still be switchable off. */
  if p_enabled and not public.partner_portal_eligible(p_group) then
    raise exception 'This partner has no primary contact with a valid email address'
      using errcode = '22023';
  end if;

  if g.portal_access_enabled = p_enabled then return; end if;

  update public.outsourcing_groups
     set portal_access_enabled = p_enabled,
         portal_access_changed_by = auth.uid(),
         portal_access_changed_at = now()
   where id = p_group;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();

  insert into public.activity_events
    (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
     action, detail, field, previous_value, new_value, visibility)
  values
    (g.agency_id, null, 'partner', p_group::text, auth.uid(), v_actor,
     case when p_enabled then 'Portal access enabled' else 'Portal access disabled' end,
     case when p_enabled
          then 'Contacts of ' || g.name || ' may now sign in to the Partner Portal.'
          else 'Contacts of ' || g.name || ' can no longer sign in. Nothing was deleted.' end
       || case when p_reason is not null and btrim(p_reason) <> '' then ' — ' || btrim(p_reason) else '' end,
     'portal_access_enabled',
     case when g.portal_access_enabled then 'ON' else 'OFF' end,
     case when p_enabled then 'ON' else 'OFF' end,
     'bes_internal');

  perform public.log_audit(
    'partner.portal_access', 'partner', p_group::text, null,
    jsonb_build_object('portal_access_enabled', g.portal_access_enabled),
    jsonb_build_object('portal_access_enabled', p_enabled, 'reason', p_reason));
end $function$;

comment on function public.set_partner_portal_access(uuid, boolean, text) is
  'Enable or disable Partner Portal access for one partner. Enabling requires an active primary contact with a valid email; disabling never does. Deletes nothing — contacts, identities, engagements and CreditOps work are untouched (Dee, 2026-09-12).';

revoke execute on function public.set_partner_portal_access(uuid, boolean, text) from public, anon;
grant execute on function public.set_partner_portal_access(uuid, boolean, text) to authenticated;
