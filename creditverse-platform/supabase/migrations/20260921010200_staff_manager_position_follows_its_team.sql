-- The "Staff Manager" position still named the archived Staff Management
-- department while its team had moved to Management (20260921010000). A
-- position lives where its team lives.
update public.positions p
   set department_id = t.department_id
  from public.teams t
 where t.id = p.team_id
   and t.name = 'Management Team'
   and p.department_id is distinct from t.department_id;
