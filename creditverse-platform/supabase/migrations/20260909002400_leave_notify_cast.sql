-- The 0237 lesson, relearned by its own author in 0251: an INSERT…SELECT does
-- not coerce a string literal into an enum the way INSERT…VALUES does, so the
-- leave-submitted trigger died with 42804 — and, being a trigger, took the
-- agent's own request down with it. The visibility gets its explicit cast.
create or replace function public.notify_leave_requested()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_name text; v_type text;
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name
    from public.profiles where id = new.user_id;
  select label into v_type from public.leave_types where id = new.type_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, new.agency_id, 'leave', 'leave_request', new.id::text,
         'Team EOD', v_name || ' requested ' || coalesce(v_type, 'leave'),
         to_char(new.starts_on, 'FMMon DD') ||
           case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'FMMon DD') else '' end ||
           coalesce('. "' || nullif(trim(new.reason), '') || '"', '') ||
           ' Decide it from Team EOD.',
         'bes_internal'::public.activity_visibility
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = new.user_id
     and tm2.user_id <> new.user_id;
  return null;
end $function$;
