-- One guard keeps test clients away from real staff (Dee, 2026-10-03:
-- "Production staff should never receive fixture clients … Use one
-- authoritative fixture/test-data guard where possible.").
--
-- 20261003004000 fixed the hourly sweep. Every other automatic path that
-- names an owner — status-change routing (creditops_route_client), the SLA
-- return (sla_sweep), handoffs, equal distribution (creditops_pick_assignee,
-- which by design picks only REAL staff), backfills — ends in the same two
-- writes: client_department_statuses.assignee_id and the client headline
-- fulfillment_clients.assigned_agent_id. So the guard sits there, once, and
-- uses the canonical classification (fulfillment_clients.is_fixture,
-- profiles.is_fixture) — never a "[TEST]" name prefix:
--
--   * a system path (automatic, handoff, team_lead, partner_action,
--     system_waiting_unassign — or the headline being derived by trigger)
--     that would give a fixture client to a real person leaves it UNASSIGNED
--     instead, so a sweep never fails on a test file;
--   * a person choosing directly (manual_override, or setting the headline
--     by hand) is refused with a plain reason.
--
-- Fixture workers may still hold fixture clients; real clients are untouched.
--
-- Cost impact: none (two indexed lookups on an assignment write).

begin;

create or replace function public.is_fixture_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select c.is_fixture from public.fulfillment_clients c where c.id = p_client), false)
$$;

create or replace function public.is_real_person(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and not coalesce(p.is_fixture, false))
$$;

revoke execute on function public.is_fixture_client(uuid) from anon, public;
revoke execute on function public.is_real_person(uuid) from anon, public;
grant execute on function public.is_fixture_client(uuid) to authenticated;
grant execute on function public.is_real_person(uuid) to authenticated;

create or replace function public.department_row_keeps_fixtures_with_fixtures()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and public.is_fixture_client(new.client_id)
     and public.is_real_person(new.assignee_id) then
    if new.assignment_method = 'manual_override' then
      raise exception 'A test client cannot be assigned to real staff' using errcode = '42501';
    end if;
    new.assignee_id := null;
    new.assignment_method := null;
    new.assignment_reason := 'Test client — never assigned to real staff';
  end if;
  return new;
end $$;

drop trigger if exists client_department_statuses_fixture_guard on public.client_department_statuses;
create trigger client_department_statuses_fixture_guard
  before insert or update of assignee_id on public.client_department_statuses
  for each row execute function public.department_row_keeps_fixtures_with_fixtures();

create or replace function public.client_headline_keeps_fixtures_with_fixtures()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_fixture and new.assigned_agent_id is not null
     and (tg_op = 'INSERT' or new.assigned_agent_id is distinct from old.assigned_agent_id)
     and public.is_real_person(new.assigned_agent_id) then
    if pg_trigger_depth() > 1 then
      new.assigned_agent_id := null;  -- derived by another trigger: leave it unowned
    else
      raise exception 'A test client cannot be assigned to real staff' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fulfillment_clients_fixture_guard on public.fulfillment_clients;
create trigger fulfillment_clients_fixture_guard
  before insert or update of assigned_agent_id on public.fulfillment_clients
  for each row execute function public.client_headline_keeps_fixtures_with_fixtures();

commit;
