-- 0183 — give Corporate Operations its service, and make the gap impossible.
--
-- Two parts, and the second is what stops this recurring:
--
--   1. Corporate Operations adopts `corporate`, so departments can live under
--      it. The value grants nothing anywhere — see 0182.
--
--   2. `divisions.service` becomes NOT NULL. A division with no service is a
--      division that cannot hold a department, which is not a useful thing to
--      be able to create. Making it required means the failure Dee hit cannot
--      be built again from the interface.
update public.divisions set service = 'corporate'
 where service is null;

alter table public.divisions alter column service set not null;

comment on column public.divisions.service is
  'What this division IS to the authorization system. `in_scope()` and `bes_may_fulfil()` read the enum, never the name, so renaming a division cannot widen or narrow what anybody sees. `corporate` is the value for a division that grants nothing — no engagement is ever created for it.';

/* The trigger no longer has a null to propagate, but say so explicitly: a
   department''s enum comes from its parent and from nowhere else. */
create or replace function public.department_sync_division()
returns trigger language plpgsql set search_path = public as $function$
declare
  v_service public.fulfillment_service;
begin
  if new.division_id is null then
    raise exception 'A department belongs to a division. Choose one.'
      using errcode = '23502';
  end if;
  select v.service into v_service from public.divisions v where v.id = new.division_id;
  if v_service is null then
    raise exception 'That division has no service and cannot hold departments'
      using errcode = '23502';
  end if;
  new.division := v_service;
  return new;
end;
$function$;
