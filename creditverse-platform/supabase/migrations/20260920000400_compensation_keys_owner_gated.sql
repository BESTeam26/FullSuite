-- management-placement-probe: "admin alone grants zero payroll" failed on the
-- new compensation keys — an administrator with no grant resolved
-- compensation.view = true, because the registry rows were written without
-- the owner gate that payroll.view / payroll.manage carry. Money keys are
-- owner-gated: held only by explicit grant (or the owner), never implied by
-- admin, placement or any other key.
update public.permission_keys
   set owner_gated = true
 where key in ('compensation.view', 'compensation.manage');
