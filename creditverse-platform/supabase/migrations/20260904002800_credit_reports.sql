-- =============================================================================
-- Canonical credit reports (proposal: ARCHITECTURE_PROPOSAL_CREDIT_REPORT_AND_SIMULATOR.md)
--
-- One import = one credit_reports row + its report_items + report_scores.
-- History is append-only: a re-import is a NEW report, never an overwrite
-- (rule 11) — which is what makes "deleted since last round" and "no
-- movement" answerable later. Scores are stored exactly as the source states
-- them (bureau, model); the platform never computes or stores a score.
--
-- Who sees a report = who sees its client. For a fulfillment client that is
-- the existing client SELECT policy, reached through entity_visible()
-- (SECURITY INVOKER, so RLS applies): organization members with the
-- entitlement, BES staff under a live engagement and within scope. A DIY
-- consumer sees their own reports; their organization's members see them when
-- entitled to diyCredit. Writers must pass the same visibility test, and only
-- through create_credit_report(), which inserts the whole import atomically as
-- the caller (SECURITY INVOKER — policies decide, not the function).
-- =============================================================================

create table public.credit_reports (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations(id) on delete cascade,
  outsourcing_group_id  uuid references public.outsourcing_groups(id) on delete cascade,
  fulfillment_client_id uuid references public.fulfillment_clients(id) on delete cascade,
  consumer_user_id      uuid references public.profiles(id) on delete cascade,
  bureaus               text[] not null check (bureaus <@ array['EQ','EX','TU'] and cardinality(bureaus) > 0),
  pulled_at             date not null,
  source                text not null check (source = 'manual_upload' or source like 'connector:%'),
  file_id               uuid references public.files(id) on delete set null,
  parser_version        text not null,
  imported_by           uuid not null references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  -- exactly one subject
  constraint credit_reports_one_subject check (
    (fulfillment_client_id is not null)::int + (consumer_user_id is not null)::int = 1
  ),
  -- a consumer report belongs to an organization (the white-label owner)
  constraint credit_reports_consumer_has_org check (consumer_user_id is null or organization_id is not null)
);
create index credit_reports_client_idx on public.credit_reports (fulfillment_client_id, pulled_at desc);
create index credit_reports_consumer_idx on public.credit_reports (consumer_user_id, pulled_at desc);
create index credit_reports_org_idx on public.credit_reports (organization_id, pulled_at desc);

create table public.report_scores (
  report_id  uuid not null references public.credit_reports(id) on delete cascade,
  bureau     text not null check (bureau in ('EQ','EX','TU')),
  model      text not null,                      -- exactly as the source states it, e.g. 'FICO 8', 'VantageScore 3.0'
  score      integer not null check (score between 250 and 900),
  primary key (report_id, bureau, model)
);

create table public.report_items (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.credit_reports(id) on delete cascade,
  position        integer not null,
  kind            text not null check (kind in ('Account','Inquiry','Personal','Public Record')),
  name            text not null,
  subtype         text,
  status          text not null,
  balance_text    text,
  balance_cents   bigint,
  bureaus         text[] not null check (bureaus <@ array['EQ','EX','TU'] and cardinality(bureaus) > 0),
  dofd            text,
  open_date       text,
  linked_creditor text,
  remarks         text,
  -- stable handle for matching the same tradeline across imports
  account_ref     text not null,
  raw             jsonb,
  unique (report_id, position)
);
create index report_items_report_idx on public.report_items (report_id);
create index report_items_ref_idx on public.report_items (account_ref);

alter table public.credit_reports enable row level security;
alter table public.report_scores  enable row level security;
alter table public.report_items   enable row level security;
revoke all on public.credit_reports, public.report_scores, public.report_items from public, anon;
grant select, insert on public.credit_reports, public.report_scores, public.report_items to authenticated;
-- no update, no delete: history is append-only

/** May the caller see this report's subject? Mirrors the client's own policy. */
create or replace function public.credit_report_visible(p_client uuid, p_consumer uuid, p_org uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select case
    when p_client is not null then public.entity_visible('fulfillment_client', p_client::text)
    when p_consumer is not null then
      p_consumer = auth.uid()
      or (public.is_org_member(p_org) and public.org_entitled(p_org, 'diyCredit'))
      or (public.bes_engaged_with(p_org))
    else false
  end
$$;

create policy credit_reports_select on public.credit_reports for select to authenticated
  using (public.credit_report_visible(fulfillment_client_id, consumer_user_id, organization_id));
create policy credit_reports_insert on public.credit_reports for insert to authenticated
  with check (imported_by = auth.uid()
              and public.credit_report_visible(fulfillment_client_id, consumer_user_id, organization_id));

create policy report_scores_select on public.report_scores for select to authenticated
  using (exists (select 1 from public.credit_reports r where r.id = report_id));
create policy report_scores_insert on public.report_scores for insert to authenticated
  with check (exists (select 1 from public.credit_reports r where r.id = report_id and r.imported_by = auth.uid()));

create policy report_items_select on public.report_items for select to authenticated
  using (exists (select 1 from public.credit_reports r where r.id = report_id));
create policy report_items_insert on public.report_items for insert to authenticated
  with check (exists (select 1 from public.credit_reports r where r.id = report_id and r.imported_by = auth.uid()));

/**
 * One import, atomically, as the caller. `p_items` is a jsonb array of
 * { kind, name, subtype, status, balance_text, balance_cents, bureaus,
 *   dofd, open_date, linked_creditor, remarks, account_ref, raw };
 * `p_scores` is [{ bureau, model, score }]. Policies decide access; the
 * function only guarantees all-or-nothing.
 */
create or replace function public.create_credit_report(
  p_org uuid, p_group uuid, p_client uuid, p_consumer uuid,
  p_bureaus text[], p_pulled_at date, p_source text, p_file uuid, p_parser_version text,
  p_items jsonb, p_scores jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A credit report needs at least one item' using errcode = '22023';
  end if;
  insert into public.credit_reports
    (organization_id, outsourcing_group_id, fulfillment_client_id, consumer_user_id, bureaus, pulled_at, source, file_id, parser_version, imported_by)
  values (p_org, p_group, p_client, p_consumer, p_bureaus, p_pulled_at, p_source, p_file, p_parser_version, auth.uid())
  returning id into v_id;

  insert into public.report_items
    (report_id, position, kind, name, subtype, status, balance_text, balance_cents, bureaus, dofd, open_date, linked_creditor, remarks, account_ref, raw)
  select v_id, (ord - 1)::int,
         i->>'kind', i->>'name', i->>'subtype', i->>'status', i->>'balance_text',
         nullif(i->>'balance_cents','')::bigint,
         array(select jsonb_array_elements_text(coalesce(i->'bureaus','[]'::jsonb))),
         i->>'dofd', i->>'open_date', i->>'linked_creditor', i->>'remarks',
         coalesce(nullif(i->>'account_ref',''), lower(i->>'name')),
         i->'raw'
    from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $$;
revoke execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) to authenticated;
revoke execute on function public.credit_report_visible(uuid, uuid, uuid) from public, anon;
grant execute on function public.credit_report_visible(uuid, uuid, uuid) to authenticated;
