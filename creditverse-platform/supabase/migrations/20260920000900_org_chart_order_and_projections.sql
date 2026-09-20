-- Dee's chart reads CreditOps · TalentOps · FundingOps · BES CRM, left to
-- right. And a department "manager" is a projection of a live seat, nothing
-- else: rows that still carried a name from before seats existed are cleared
-- unless a seat backs them (Rowell keeps BES CRM by his division seat).
update public.divisions set sort = 1 where service = 'creditops'  and archived_at is null;
update public.divisions set sort = 2 where service = 'talentops'  and archived_at is null;
update public.divisions set sort = 3 where service = 'fundingops' and archived_at is null;
update public.divisions set sort = 4 where service = 'bes_crm'    and archived_at is null;

update public.departments d set manager_id = null
 where d.manager_id is not null
   and not exists (select 1 from public.management_seats s
                    where s.department_id = d.id and s.seat = 'department_manager' and public.seat_is_live(s.effective_from, s.effective_to));
update public.divisions dv set lead_id = (
  select s.user_id from public.management_seats s where s.division_id = dv.id and s.seat = 'division_manager'
    and public.seat_is_live(s.effective_from, s.effective_to) order by s.effective_from desc, s.created_at desc limit 1)
 where dv.archived_at is null;
