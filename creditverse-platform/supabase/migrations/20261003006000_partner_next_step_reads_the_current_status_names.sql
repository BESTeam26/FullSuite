-- The Partner Portal reads the current status names (Dee, 2026-10-03: "A
-- completed workstream must never display to a Partner as still In progress
-- just because the projection is using an old status name.").
--
-- creditops_partner_next_step() (20261001009000) still listed the retired
-- abbreviations BC NOT NEEDED / BC COMPLETED / CM NOT NEEDED / CM COMPLETED /
-- CM AWAITING RESPONSE. The statuses in use are the long forms — the same
-- list creditops_status_is_actionable() and the app's
-- CLOSED_DEPARTMENT_STATUSES use — so a finished complaint or bureau-calling
-- workstream fell through to 'in_progress' ("BES is working on it").
--
-- Now: every closed status reads completed (or closed, for ARCHIVED /
-- INACTIVE). COMPLAINT AWAITING RESPONSE is BES waiting on the bureau or the
-- regulator, so it reads waiting_for_results ("Waiting for bureau results"),
-- not "waiting on the client" as the old CM mapping said. No row holds a
-- retired name (checked), so nothing else changes. Matrix phase 77 now asserts
-- every current closed status projects as completed/closed.
--
-- Cost impact: none.

begin;

create or replace function public.creditops_partner_next_step(p_department public.fulfillment_department, p_status text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_status is null then 'not_started'
    when upper(trim(p_status)) in ('BUREAU CALLING NOT NEEDED', 'BUREAU CALLING COMPLETED',
                                   'COMPLAINT NOT NEEDED', 'COMPLAINT COMPLETED', 'SUPPORT RESOLVED',
                                   'ONBOARDING READY FOR ROUND 1', 'OB READY FOR R1', 'PARTNER ENDORSED',
                                   'COMPLETED') then 'completed'
    when upper(trim(p_status)) = 'ARCHIVED / INACTIVE' then 'closed'
    when upper(trim(p_status)) in ('ROUND SENT - AWAITING RESULTS', 'COMPLAINT AWAITING RESPONSE')
      or upper(trim(p_status)) like 'ROUND % SENT%' then 'waiting_for_results'
    when upper(trim(p_status)) = 'WAITING FOR PARTNER APPROVAL' then 'waiting_on_partner'
    when upper(trim(p_status)) in ('WAITING CLIENT RESPONSE', 'WAITING ON CLIENT', 'DOCS PENDING',
                                   'FOR CLIENT CONFIRMATION') then 'waiting_on_client'
    else 'in_progress'
  end
$$;

commit;
