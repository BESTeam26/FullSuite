-- "Not too many and not too complicated, but those options matter" — Dee,
-- minutes after the previous seed. Medical duplicated Sick leave and jury
-- duty was clutter; the list is now eight that cover real life. Removed only
-- while unreferenced — a type with history would be deactivated, never
-- deleted (rule 11).
delete from public.leave_types t
 where t.code in ('medical', 'jury_duty')
   and not exists (select 1 from public.leave_requests r where r.type_id = t.id);
update public.leave_types set active = false
 where code in ('medical', 'jury_duty');
