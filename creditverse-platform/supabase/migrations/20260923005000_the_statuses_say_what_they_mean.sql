-- BC and CM are spelled out. They were never Dee's words.
--
-- Dee, 2026-09-23: "i still see BC or OB, those are your internal terms and
-- not mine, as much as possible I don't shortcut them for confusion."
--
-- She said the same about OB on 2026-09-22 — "I don't want OB, I need full
-- term" — and that was fixed for Onboarding while Bureau Calling and
-- Complaints were left carrying the same habit. Hence "i STILL see".
--
--   BC NOT NEEDED         → BUREAU CALLING NOT NEEDED
--   BC NEEDED             → BUREAU CALLING NEEDED
--   BC IN PROGRESS        → BUREAU CALLING IN PROGRESS
--   BC COMPLETED          → BUREAU CALLING COMPLETED
--   CM NOT NEEDED         → COMPLAINT NOT NEEDED
--   CM AWAITING RESPONSE  → COMPLAINT AWAITING RESPONSE
--   CM COMPLETED          → COMPLAINT COMPLETED
--
-- CFPB, FTC, BBB and AG are NOT touched. Those are the agencies themselves and
-- they are Dee's own vocabulary — "FOR CFPB ONLY" is a status on her ClickUp
-- board. The rule is not "no capital letters", it is "no shorthand somebody
-- has to be told the meaning of".
--
-- ── THE SAME NAME LIVES IN FOUR PLACES ────────────────────────────────────
--
-- `creditops_status_routing.status` is the ENUM, so renaming the value carries
-- it. The other three are TEXT and do not move on their own:
--
--   client_department_statuses.status      what each file currently says
--   creditops_status_routing.entry_status  what routing opens a department ON
--   sla_policies.status                    which state a deadline applies to
--
-- Missing any one of them would leave a file reading BUREAU CALLING NEEDED
-- while its routing rule still looked for BC NEEDED — the file would simply
-- stop being routed, silently. So all four move together, in one transaction,
-- and the guard at the end refuses the migration if a shorthand survives
-- anywhere.
--
-- Cost impact: no material increase.

begin;

/* The enum values. A rename carries every enum-typed column with it. */
alter type public.fulfillment_client_status rename value 'BC NOT NEEDED'  to 'BUREAU CALLING NOT NEEDED';
alter type public.fulfillment_client_status rename value 'BC NEEDED'      to 'BUREAU CALLING NEEDED';
alter type public.fulfillment_client_status rename value 'BC IN PROGRESS' to 'BUREAU CALLING IN PROGRESS';
alter type public.fulfillment_client_status rename value 'BC COMPLETED'   to 'BUREAU CALLING COMPLETED';
alter type public.fulfillment_client_status rename value 'CM COMPLETED'   to 'COMPLAINT COMPLETED';

commit;

/* The text columns, which a rename does not reach. */
do $$
declare
  m text[][] := array[
    array['BC NOT NEEDED',        'BUREAU CALLING NOT NEEDED'],
    array['BC NEEDED',            'BUREAU CALLING NEEDED'],
    array['BC IN PROGRESS',       'BUREAU CALLING IN PROGRESS'],
    array['BC COMPLETED',         'BUREAU CALLING COMPLETED'],
    array['CM NOT NEEDED',        'COMPLAINT NOT NEEDED'],
    array['CM AWAITING RESPONSE', 'COMPLAINT AWAITING RESPONSE'],
    array['CM COMPLETED',         'COMPLAINT COMPLETED']
  ];
  i int;
begin
  for i in 1 .. array_length(m, 1) loop
    update public.client_department_statuses set status = m[i][2] where status = m[i][1];
    update public.creditops_status_routing  set entry_status = m[i][2] where entry_status = m[i][1];
    update public.sla_policies              set status = m[i][2] where status = m[i][1];
  end loop;
end $$;

/* The vocabulary the dropdowns read. */
do $$
declare
  v_def text := pg_get_functiondef('public.creditops_department_statuses(public.fulfillment_department)'::regprocedure);
  v_new text := v_def;
  m text[][] := array[
    array['BC NOT NEEDED',        'BUREAU CALLING NOT NEEDED'],
    array['BC NEEDED',            'BUREAU CALLING NEEDED'],
    array['BC IN PROGRESS',       'BUREAU CALLING IN PROGRESS'],
    array['BC COMPLETED',         'BUREAU CALLING COMPLETED'],
    array['CM NOT NEEDED',        'COMPLAINT NOT NEEDED'],
    array['CM AWAITING RESPONSE', 'COMPLAINT AWAITING RESPONSE'],
    array['CM COMPLETED',         'COMPLAINT COMPLETED']
  ];
  i int;
begin
  for i in 1 .. array_length(m, 1) loop
    v_new := replace(v_new, '''' || m[i][1] || '''', '''' || m[i][2] || '''');
  end loop;
  if v_new = v_def then
    raise exception 'creditops_department_statuses held none of the shorthand — read it before replacing it';
  end if;
  execute v_new;
end $$;

/* Nothing shortened survives, in the vocabulary or in a stored row. A file
   still reading BC NEEDED while routing looks for BUREAU CALLING NEEDED would
   quietly stop being routed, which is the failure this guard exists for. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad from (
    select 1 from public.client_department_statuses where status ~ '^(BC|CM|OB) '
    union all
    select 1 from public.creditops_status_routing where entry_status ~ '^(BC|CM|OB) '
    union all
    select 1 from public.sla_policies where status ~ '^(BC|CM|OB) '
    union all
    select 1 from unnest(enum_range(null::public.fulfillment_client_status)) v
     where v::text ~ '^(BC|CM|OB) '
    union all
    select 1 from (
      select unnest(public.creditops_department_statuses(d)) s
        from unnest(enum_range(null::public.fulfillment_department)) d
    ) x where x.s ~ '^(BC|CM|OB) '
  ) t;
  if v_bad > 0 then
    raise exception '% shortened statuses still remain', v_bad;
  end if;
end $$;
