-- RLS decides WHO; grants decide WHETHER the role may ask at all. The three
-- people-management migrations declared policies but not grants, so every
-- request died at the door with 42501 regardless of policy. Policies stay
-- the authority — these grants only let them be consulted.
grant select                         on public.work_schedules  to authenticated;
grant select, insert, update, delete on public.leave_types     to authenticated;
grant select, insert, update         on public.leave_requests  to authenticated;
grant select                         on public.member_pay_rates to authenticated;
grant select, insert, delete         on public.payroll_cutoffs to authenticated;
grant select                         on public.payslips        to authenticated;
