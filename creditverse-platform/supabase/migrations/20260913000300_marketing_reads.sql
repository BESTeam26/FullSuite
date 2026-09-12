-- =============================================================================
-- What the Sales & Marketing screens read.
--
-- ── ONE RECORD, THREE VIEWS ─────────────────────────────────────────────────
--
-- Dee: "One canonical work_item displayed by publish/scheduled date. Do NOT
-- create duplicate content records just to make the calendar."
--
-- So the Tasks list, the Content Calendar and the Dashboard all read
-- `marketing_work`. A scheduled post is not a different row from the task that
-- produces it — it is the same row asked a different question. Moving a card
-- on the calendar therefore moves the task, because there is nothing else it
-- could move.
--
-- The view is `security_invoker`, so every row it returns has already passed
-- `work_items_select` as the signed-in person. A view without that setting
-- runs as its owner and quietly hands one partner's work to another — the
-- single most expensive mistake available in this schema.
-- =============================================================================

/* ISO dates sort correctly as text, so the field value is indexed as text
   rather than cast — `text::date` is STABLE, not IMMUTABLE, and cannot be
   indexed at all. This is the index the calendar's month window uses. */
create index if not exists work_item_field_values_by_field_value
  on public.work_item_field_values (field_id, (value #>> '{}'));

/**
 * Every marketing work item the caller may see, with the context each screen
 * needs already attached: the workspace, the partner, the status, the
 * assignee, the campaign, and the content fields.
 *
 * One lateral join collects the three content fields in a single pass over
 * that item's own values, rather than three correlated subqueries per row
 * (rule 14 — no N+1, including the N+1 hidden inside one statement).
 */
create or replace view public.marketing_work as
  select
    wi.id,
    wi.workspace_id,
    w.name              as workspace_name,
    w.partner_group_id,
    g.name              as partner_name,
    wi.title,
    wi.description,
    wi.priority,
    wi.assigned_to,
    coalesce(nullif(btrim(pr.full_name), ''), pr.email) as assignee_name,
    wi.team_id,
    wi.due_at,
    wi.completed_at,
    wi.created_at,
    wi.updated_at,
    wi.status_id,
    s.key               as status_key,
    s.label             as status_label,
    s.colour            as status_colour,
    s.position          as status_position,
    coalesce(s.is_terminal, false) as is_terminal,
    wi.item_type_id,
    t.key               as item_type_key,
    t.label             as item_type_label,
    wi.campaign_id,
    c.name              as campaign_name,
    fv.publish_on,
    fv.channel,
    fv.content_type
  from public.work_items wi
  join public.workspaces w
    on w.id = wi.workspace_id and w.module = 'sales_marketing' and w.archived_at is null
  left join public.outsourcing_groups g on g.id = w.partner_group_id
  left join public.workspace_statuses  s on s.id = wi.status_id
  left join public.workspace_item_types t on t.id = wi.item_type_id
  left join public.campaigns           c on c.id = wi.campaign_id
  left join public.profiles           pr on pr.id = wi.assigned_to
  left join lateral (
    select
      max(case when f.key = 'publish_at'   then v.value #>> '{}' end) as publish_on,
      max(case when f.key = 'channel'      then v.value #>> '{}' end) as channel,
      max(case when f.key = 'content_type' then v.value #>> '{}' end) as content_type
    from public.work_item_field_values v
    join public.workspace_fields f on f.id = v.field_id
   where v.work_item_id = wi.id
  ) fv on true
 where wi.archived_at is null;

alter view public.marketing_work set (security_invoker = true);
comment on view public.marketing_work is
  'Marketing work items with their workspace, partner, status, assignee, campaign and content fields. The one read behind Tasks, the Content Calendar and the Dashboard — a scheduled post is the same row as the task that produces it (Dee, 2026-09-12).';
grant select on public.marketing_work to authenticated;

/**
 * The seven numbers on the module dashboard, in one request.
 *
 * Dee named them: Active Marketing Partners, Open Tasks, Due Today, Overdue,
 * Content Scheduled, For Internal Review, Awaiting Partner Approval.
 *
 * "Today" is the agency's own day, not the reader's browser: a team spread
 * across time zones must agree on what is due today, or two people looking at
 * the same board disagree about whether anything is late.
 */
create or replace view public.marketing_overview as
  with today as (
    select (now() at time zone coalesce(a.eod_timezone, 'UTC'))::date as d
      from public.agencies a
     order by a.created_at
     limit 1
  )
  select
    (select count(*) from public.marketing_partners)                              as active_partners,
    count(*) filter (where not is_terminal)                                       as open_tasks,
    count(*) filter (where not is_terminal and due_at is not null
                       and due_at::date = (select d from today))                  as due_today,
    count(*) filter (where not is_terminal and due_at is not null
                       and due_at < now())                                        as overdue,
    count(*) filter (where not is_terminal and publish_on is not null
                       and publish_on >= (select d from today)::text)             as content_scheduled,
    count(*) filter (where status_key = 'internal_review')                        as for_internal_review,
    count(*) filter (where status_key = 'partner_approval')                       as awaiting_partner_approval
  from public.marketing_work;

alter view public.marketing_overview set (security_invoker = true);
comment on view public.marketing_overview is
  'The Sales & Marketing dashboard counters, computed over exactly the rows the caller may read. Two people with different access see different numbers, and both are right (2026-09-13).';
grant select on public.marketing_overview to authenticated;

/**
 * Approvals a partner has been asked for, and what they said.
 *
 * Marketing approvals and CreditOps confirmations are the same record with
 * different context: a CreditOps confirmation carries `origin_status` and
 * `origin_department`, a marketing approval carries the work item or the
 * campaign. This view is the marketing half, for the internal screens that ask
 * "what are we waiting on?".
 */
create or replace view public.marketing_approvals as
  select
    a.id, a.group_id, g.name as partner_name,
    a.kind, a.status, a.title, a.detail,
    a.work_item_id, wi.title as work_title,
    a.campaign_id, c.name as campaign_name,
    a.requested_by, a.created_at,
    a.responded_by, a.responded_at, a.response,
    coalesce(nullif(btrim(rb.full_name), ''), rb.email) as responded_by_name
  from public.partner_action_items a
  join public.outsourcing_groups g on g.id = a.group_id
  left join public.work_items wi on wi.id = a.work_item_id
  left join public.campaigns  c  on c.id = a.campaign_id
  left join public.profiles   rb on rb.id = a.responded_by
 where a.kind in ('content_approval', 'campaign_approval');

alter view public.marketing_approvals set (security_invoker = true);
grant select on public.marketing_approvals to authenticated;
