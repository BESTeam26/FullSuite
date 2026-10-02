-- A closed status closes the client (Dee, 2026-10-02):
--
--   "Completed program, Archive and Inactive or canceled should not be
--    showing in the ACTIVE clients view by default."
--
-- The Active view reads ONE rule, isActiveClient(): lifecycle = 'active'. The
-- rule was right; the data under it was not. 55 live clients carried a
-- closing status while their lifecycle still said active — most arrived that
-- way from the ClickUp import, where a status was set and the lifecycle was
-- left at its default:
--
--   Program Completed     24  → lifecycle program_completed
--   Inactive / Canceled   17  → lifecycle archived
--   Graduated             14  → lifecycle graduated
--
-- 1. Those 55 move to the lifecycle their status already states, each with an
--    activity entry saying why (rule 10 — history explains itself).
-- 2. From now on the lifecycle follows a closing status the moment it is set,
--    and a client moved back to a working status from a closing one becomes
--    active again — so the two can no longer disagree in either direction.
--    set_client_lifecycle() remains the explicit control for everything else.

create or replace function public.fulfillment_client_lifecycle_follows_status()
returns trigger language plpgsql set search_path = public as $$
declare
  v_closed public.client_lifecycle;
begin
  v_closed := case new.status::text
    when 'Program Completed'   then 'program_completed'::public.client_lifecycle
    when 'Graduated'           then 'graduated'::public.client_lifecycle
    when 'Inactive / Canceled' then 'archived'::public.client_lifecycle
  end;

  if v_closed is not null then
    /* A closing status closes the client, unless it already is closed. */
    if new.lifecycle = 'active' then
      new.lifecycle := v_closed;
      if v_closed = 'archived' then
        new.archived_at := coalesce(new.archived_at, now());
        new.archive_reason := coalesce(new.archive_reason, 'Status set to Inactive / Canceled');
      end if;
    end if;
  elsif tg_op = 'UPDATE'
        and old.status::text in ('Program Completed', 'Graduated', 'Inactive / Canceled')
        and new.lifecycle <> 'active' then
    /* Moved back to a working status: the client is being worked again. */
    new.lifecycle := 'active';
    new.archived_at := null;
    new.archive_reason := null;
  end if;
  return new;
end $$;

drop trigger if exists fulfillment_clients_lifecycle_follows_status on public.fulfillment_clients;
create trigger fulfillment_clients_lifecycle_follows_status
  before insert or update of status on public.fulfillment_clients
  for each row execute function public.fulfillment_client_lifecycle_follows_status();

/* The 55 already out of step. One activity entry each, written as the
   system (no actor), naming the status that decided it. */
with moved as (
  update public.fulfillment_clients c
     set lifecycle = case c.status::text
                       when 'Program Completed'   then 'program_completed'::public.client_lifecycle
                       when 'Graduated'           then 'graduated'::public.client_lifecycle
                       else 'archived'::public.client_lifecycle end,
         archived_at = case when c.status::text = 'Inactive / Canceled' then coalesce(c.archived_at, now()) else c.archived_at end,
         archive_reason = case when c.status::text = 'Inactive / Canceled'
                               then coalesce(c.archive_reason, 'Status was Inactive / Canceled (corrected 2026-10-02)') else c.archive_reason end
   where c.lifecycle = 'active'
     and c.status::text in ('Program Completed', 'Graduated', 'Inactive / Canceled')
  returning c.id, c.agency_id, c.organization_id, c.status::text as status, c.lifecycle::text as lifecycle
)
insert into public.activity_events
  (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name, action, detail,
   field, previous_value, new_value, visibility)
select m.agency_id, m.organization_id, 'fulfillment_client', m.id::text, null, 'BES',
       case m.lifecycle when 'archived' then 'Client archived' else 'Lifecycle changed' end,
       'Status was ' || m.status || '; the client is no longer counted as active (Dee, 2026-10-02).',
       'lifecycle', 'active', m.lifecycle, 'bes_internal'::public.activity_visibility
  from moved m;
