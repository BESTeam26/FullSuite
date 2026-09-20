-- The report groups by division, and filters by it.
--
-- Dee asked for "the full productivity report for each department, on all
-- divisions… I can filter so I can have full visibility". Division was not a
-- dimension at all; the nearest thing, Service, is the raw key and was the one
-- the BES CRM hyphen split in two.
--
-- Grouping by Department now uses the DIVISION-SCOPED department, so
-- CreditOps Support and FundingOps Support are two rows and always were two
-- different teams.
--
-- Generated — see supabase/scripts/gen-pivot-by-division.mjs.

CREATE OR REPLACE FUNCTION public.report_pivot(p_rows text, p_kpis text[], p_filters jsonb DEFAULT '{}'::jsonb, p_from date DEFAULT (CURRENT_DATE - 180), p_to date DEFAULT CURRENT_DATE)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_dim text; v_cols text := ''; k record; v_sql text; v_where text := '';
begin
  v_dim := case p_rows
    when 'employee' then 'employee_id::text' when 'department' then 'department_scoped' when 'division' then 'division' when 'organization' then 'organization_id::text'
    when 'client' then 'client_id::text' when 'month' then 'to_char(fact_date, ''YYYY-MM'')' when 'service' then 'service'
    else null end;
  if v_dim is null then raise exception 'Unknown row dimension %', p_rows using errcode = '22023'; end if;
  for k in select * from public.kpi_definitions where key = any(p_kpis) order by sort loop
    if k.bes_internal and not public.is_agency_staff() then continue; end if;
    v_cols := v_cols || format(', %s as %I',
      case k.aggregation
        when 'count'                 then format('count(case when source = %L%s then 1 end)', k.source, public.kpi_match_sql(k.match))
        when 'count_distinct_client' then format('count(distinct case when source = %L%s then client_id end)', k.source, public.kpi_match_sql(k.match))
        when 'sum_quantity'          then format('coalesce(sum(case when source = %L%s then quantity end), 0)', k.source, public.kpi_match_sql(k.match))
        when 'sum_minutes'           then format('coalesce(sum(case when source = %L%s then minutes end), 0)', k.source, public.kpi_match_sql(k.match))
        when 'sum_amount'            then format('coalesce(sum(case when source = %L%s then amount end), 0)', k.source, public.kpi_match_sql(k.match))
      end, k.key);
  end loop;
  if v_cols = '' then return; end if;
  if p_filters ? 'organization_id' then v_where := v_where || format(' and organization_id = %L', p_filters->>'organization_id'); end if;
  if p_filters ? 'service'         then v_where := v_where || format(' and service = %L', p_filters->>'service'); end if;
  if p_filters ? 'department'      then v_where := v_where || format(' and department_scoped = %L', p_filters->>'department'); end if;
  if p_filters ? 'division'        then v_where := v_where || format(' and division = %L', p_filters->>'division'); end if;
  if p_filters ? 'employee_id'     then v_where := v_where || format(' and employee_id = %L', p_filters->>'employee_id'); end if;
  v_sql := format('select to_jsonb(x) from (select %s as row %s from public.report_facts_scoped where fact_date between %L and %L %s group by 1 order by 1) x', v_dim, v_cols, p_from, p_to, v_where);
  return query execute v_sql;
end $function$
;
