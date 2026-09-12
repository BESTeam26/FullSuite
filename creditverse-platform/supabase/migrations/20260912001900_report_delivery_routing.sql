-- =============================================================================
-- Who receives which report, as data.
--
-- Dee, 2026-09-12: "I also want all EOD to be sent to that inbox. All payroll
-- and other financial reports only send to wecare@blessedempireservices.com."
--
-- ── THERE WAS NO REPORT DELIVERY AT ALL ─────────────────────────────────────
--
-- EOD submissions and payroll runs have lived in the database for weeks and
-- nothing has ever emailed either. So this is not a setting being changed; it
-- is the thing that sends them, and the first decision is where the addresses
-- live.
--
-- ── WHY A TABLE AND NOT TWO CONSTANTS ───────────────────────────────────────
--
-- A financial report going to the wrong inbox is the kind of mistake that is
-- discovered late and cannot be taken back. Two email addresses written into
-- a function are two strings nobody can audit, nobody can change without a
-- migration, and nothing records who changed. As rows they are visible, they
-- are edited through a checked writer, and every change is audited.
--
-- ── THE SEPARATION IS THE POINT ─────────────────────────────────────────────
--
-- `support@` is the general operations inbox several people read. `wecare@`
-- is where money goes. Financial reports must NEVER reach the shared inbox,
-- and the check below refuses to point a financial report at any address
-- already receiving an operational one — not as a convention, as a
-- constraint.
-- =============================================================================

create table if not exists public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  /** What kind of report. Financial kinds are held to the rule below. */
  report_kind text not null check (report_kind in (
    'eod_daily', 'eod_team_daily', 'payroll', 'finance_summary', 'partner_revenue'
  )),
  email citext not null,
  label text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, report_kind, email)
);

comment on table public.report_recipients is
  'Which inbox receives which report. Rows, not constants: a financial report reaching the wrong inbox cannot be taken back, so the addresses are visible, checked and audited (Dee, 2026-09-12).';

/** Financial kinds, named once. */
create or replace function public.is_financial_report(p_kind text)
returns boolean language sql immutable set search_path = public as $function$
  select p_kind in ('payroll', 'finance_summary', 'partner_revenue')
$function$;

alter table public.report_recipients enable row level security;

/* Reading the list is management; the money rows are owner-gated, because
   knowing where payroll goes is knowing something about payroll. */
drop policy if exists report_recipients_select on public.report_recipients;
create policy report_recipients_select on public.report_recipients
  for select to authenticated
  using (
    public.is_staff_of(agency_id)
    and (
      not public.is_financial_report(report_kind)
      or public.agency_can('finance.dashboard.view')
    )
  );

/* Written only through the function below, which enforces the separation. */

create or replace function public.set_report_recipient(
  p_kind text, p_email text, p_label text default null, p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
  v_email citext := lower(btrim(p_email))::citext;
  v_id uuid;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and status = 'active' limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;

  /* Changing where MONEY is sent is the owner's, exactly like the reports
     themselves (P-004: money is the owner's unless the owner grants it). */
  if public.is_financial_report(p_kind) then
    if not public.agency_can('finance.dashboard.view') then
      raise exception 'Financial report delivery is owner-gated' using errcode = '42501';
    end if;
  elsif not (public.is_manager_of(v_agency) and public.agency_can('ops.manage')) then
    raise exception 'Managing operations is required' using errcode = '42501';
  end if;

  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;

  /* THE SEPARATION, as a constraint rather than a convention. An address
     that already receives an operational report cannot be given a financial
     one, and the reverse. */
  if p_active then
    if public.is_financial_report(p_kind) then
      if exists (select 1 from public.report_recipients r
                  where r.agency_id = v_agency and r.email = v_email and r.active
                    and not public.is_financial_report(r.report_kind)) then
        raise exception 'That inbox already receives operational reports. Financial reports go somewhere separate.'
          using errcode = '22023';
      end if;
    else
      if exists (select 1 from public.report_recipients r
                  where r.agency_id = v_agency and r.email = v_email and r.active
                    and public.is_financial_report(r.report_kind)) then
        raise exception 'That inbox receives financial reports. Operational reports go somewhere separate.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.report_recipients (agency_id, report_kind, email, label, active, created_by)
  values (v_agency, p_kind, v_email, nullif(btrim(coalesce(p_label, '')), ''), p_active, auth.uid())
  on conflict (agency_id, report_kind, email) do update
    set active = excluded.active, label = coalesce(excluded.label, public.report_recipients.label),
        updated_at = now()
  returning id into v_id;

  perform public.log_audit('report.recipient_set', 'report_recipient', v_id::text, null, null,
    jsonb_build_object('kind', p_kind, 'email', v_email, 'active', p_active));
  return v_id;
end $function$;

revoke execute on function public.set_report_recipient(text, text, text, boolean) from public, anon;
grant execute on function public.set_report_recipient(text, text, text, boolean) to authenticated;

-- ── Dee's two rules ─────────────────────────────────────────────────────────
insert into public.report_recipients (agency_id, report_kind, email, label)
select a.id, v.kind, v.email::citext, v.label from public.agencies a,
  (values
    ('eod_daily',       'support@blessedempireservices.com', 'General operations inbox'),
    ('eod_team_daily',  'support@blessedempireservices.com', 'General operations inbox'),
    ('payroll',         'wecare@blessedempireservices.com',  'Finance'),
    ('finance_summary', 'wecare@blessedempireservices.com',  'Finance'),
    ('partner_revenue', 'wecare@blessedempireservices.com',  'Finance')
  ) as v(kind, email, label)
on conflict (agency_id, report_kind, email) do update set active = true, updated_at = now();
