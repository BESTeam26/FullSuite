-- Production metric labels are presentation, not department names.
--
-- Dee, 2026-09-30: "Do not blindly rename database departments just for
-- presentation. First distinguish: organizational department name;
-- production metric/category label. If the production report needs wording
-- such as Processes Done, make that a presentation/metric label."
--
-- The schema already keeps the two apart: `departments.name` is the
-- organizational unit ("Dispute Department"), and `production_departments.
-- label` is the metric heading the EOD report prints. Only the labels had
-- never been set — they still echoed the key. Nothing here touches
-- `departments`, `production_departments.key`, routing, or any status.
--
-- The four that match Dee's reference report take its wording. The two it
-- did not name take the plainest reading of the unit they count.
--
-- Cost impact: none.

begin;

update public.production_departments set label = v.label
  from (values
    ('creditops', 'Dispute',        'Processes Done'),
    ('creditops', 'Complaints',     'Complaints Done'),
    ('creditops', 'Bureau Calling', 'Calls Made'),
    ('creditops', 'Support',        'Support Resolved'),
    ('creditops', 'Onboarding',     'Onboardings Completed')
  ) as v(service, key, label)
 where production_departments.service = v.service::public.fulfillment_service
   and production_departments.key = v.key
   and production_departments.label is distinct from v.label;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.production_departments
   where service = 'creditops' and label = key;
  if v_n > 0 then
    raise notice '% CreditOps categories still labelled by key — the report will show the key for those', v_n;
  end if;
  /* The organizational names are untouched. */
  if not exists (select 1 from public.departments where name = 'Dispute Department') then
    raise exception 'departments.name changed — this migration must not touch it';
  end if;
end $$;

commit;
