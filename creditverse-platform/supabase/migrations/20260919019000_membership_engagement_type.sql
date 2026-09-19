-- Engagement type on the canonical membership (Dee, 2026-09-19: "i want
-- contractor field"). Employee or contractor — an organizational fact set by
-- management on the Team Member Profile and shown read-only on the person's
-- own My Profile. One column on agency_memberships, never a second record.
--
-- A fixed check rather than an enum: adding a kind later is an ALTER of the
-- constraint, not a type migration. Null means "not recorded".

alter table public.agency_memberships
  add column if not exists engagement_type text
  check (engagement_type in ('employee', 'contractor'));
comment on column public.agency_memberships.engagement_type is
  'How the person is engaged by BES: employee or contractor. Management sets it; the person reads it.';

-- A change to how somebody is engaged is a meaningful mutation (rule 10):
-- actor, previous and new value, on the same profile trail as the Employee ID.
create or replace function public.agency_memberships_audit_engagement_type() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  if new.engagement_type is distinct from old.engagement_type then
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (old.agency_id, 'profile', old.user_id::text, auth.uid(), v_actor, 'Engagement type changed', 'engagement_type', old.engagement_type, new.engagement_type, 'bes_internal');
  end if;
  return new;
end $function$;
drop trigger if exists agency_memberships_audit_engagement_type on public.agency_memberships;
create trigger agency_memberships_audit_engagement_type after update on public.agency_memberships
  for each row execute function public.agency_memberships_audit_engagement_type();
