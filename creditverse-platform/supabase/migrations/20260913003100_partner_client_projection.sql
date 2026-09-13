-- =============================================================================
-- What a partner may know about their own client.
--
-- Dee, 2026-09-13, for the portal's Clients page:
--
--   "Do NOT expose: BES internal notes, internal employee assignment, raw SLA,
--    internal audit, sensitive credentials, internal comments."
--
-- So the projection is written as a WHITELIST. Every column is named; nothing
-- arrives because it happened to be on the row. `assignee_id`, `team_id`,
-- `system_due_at`, `manual_due_reason`, `next_action`, the SSN and the
-- monitoring login are all absent by construction rather than by a filter
-- somebody has to remember.
--
-- ── WHAT IS ADDED ───────────────────────────────────────────────────────────
--
-- Current department, the work it is doing, and whether BES is waiting on the
-- PARTNER for something. All three are already canonical — they are simply not
-- yet reaching the portal, so the page cannot say "Partner Confirmation
-- Required" where it matters most.
-- =============================================================================

/* The shape changes, so the old signature is dropped rather than left beside
   it — a defaulted parameter creates an overload, and an ambiguous call is how
   inviting anybody broke earlier this week. */
drop function if exists public.my_partner_clients(boolean);

/**
 * The partner's own clients, as they may see them.
 *
 * `current_work` is the department's own status text — "DISPUTE PROCESSING",
 * "WAITING ON CLIENT" — which is what BES is actually doing, said plainly.
 * It is not the internal next-action note, which is written for an agent.
 */
create or replace function public.my_partner_clients(p_include_closed boolean default false)
returns table(
  public_id text,
  name text,
  email citext,
  status text,
  round text,
  open_items integer,
  lifecycle text,
  last_activity_at timestamptz,
  processed_on date,
  created_at timestamptz,
  current_department text,
  current_work text,
  waiting boolean,
  action_needed boolean,
  action_title text
)
language sql stable security definer set search_path = public as $function$
  select c.public_id, c.name, c.email, c.status::text, c.round::text,
         c.open_items, c.lifecycle::text, c.last_activity_at, c.processed_on,
         c.created_at,
         d.department::text,
         d.status,
         /* Waiting means BES is not actively working it — a fact about the
            file, not an internal SLA figure. */
         not public.creditops_status_is_actionable(d.department, d.status),
         a.id is not null,
         a.title
    from public.fulfillment_clients c
    left join lateral (
      select s.department, s.status
        from public.client_department_statuses s
       where s.client_id = c.id
       order by public.creditops_status_is_actionable(s.department, s.status) desc, s.updated_at desc
       limit 1
    ) d on true
    left join lateral (
      select pa.id, pa.title
        from public.partner_action_items pa
       where pa.fulfillment_client_id = c.id and pa.status = 'open'
       order by pa.created_at
       limit 1
    ) a on true
   where c.outsourcing_group_id = public.partner_group_of_user()
     and c.is_fixture = false
     and (p_include_closed or c.lifecycle <> 'archived')
   order by c.last_activity_at desc
$function$;
revoke execute on function public.my_partner_clients(boolean) from public, anon;
grant execute on function public.my_partner_clients(boolean) to authenticated;

/**
 * One client, for the partner-safe detail page.
 *
 * Takes the PUBLIC id, not the internal uuid: the portal never learns the
 * primary key, so a guessed id reaches nothing. The whitelist is the same one
 * as above, and the same omissions apply.
 */
create or replace function public.my_partner_client(p_public_id text)
returns table(
  public_id text, name text, email citext, phone text,
  status text, round text, lifecycle text, open_items integer,
  created_at timestamptz, last_activity_at timestamptz, processed_on date,
  current_department text, current_work text, waiting boolean,
  action_needed boolean, action_id uuid, action_title text, action_detail text, action_kind text
)
language sql stable security definer set search_path = public as $function$
  select c.public_id, c.name, c.email, c.phone,
         c.status::text, c.round::text, c.lifecycle::text, c.open_items,
         c.created_at, c.last_activity_at, c.processed_on,
         d.department::text, d.status,
         not public.creditops_status_is_actionable(d.department, d.status),
         a.id is not null, a.id, a.title, a.detail, a.kind
    from public.fulfillment_clients c
    left join lateral (
      select s.department, s.status
        from public.client_department_statuses s
       where s.client_id = c.id
       order by public.creditops_status_is_actionable(s.department, s.status) desc, s.updated_at desc
       limit 1
    ) d on true
    left join lateral (
      select pa.id, pa.title, pa.detail, pa.kind
        from public.partner_action_items pa
       where pa.fulfillment_client_id = c.id and pa.status = 'open'
       order by pa.created_at limit 1
    ) a on true
   where c.public_id = p_public_id
     and c.outsourcing_group_id = public.partner_group_of_user()
     and c.is_fixture = false
$function$;
revoke execute on function public.my_partner_client(text) from public, anon;
grant execute on function public.my_partner_client(text) to authenticated;

/**
 * That client's timeline, partner-safe.
 *
 * `visibility = 'shared_with_partner'` is the whole filter, and it is the
 * SAME flag BES sets when it deliberately shares an update. A note written
 * `bes_internal` is not hidden from this list — it never enters it.
 */
create or replace function public.my_partner_client_timeline(p_public_id text, p_limit integer default 50)
returns table(id bigint, happened_at timestamptz, action text, detail text, actor_name text)
language sql stable security definer set search_path = public as $function$
  select e.id, e.created_at, e.action, e.detail, e.actor_name
    from public.activity_events e
    join public.fulfillment_clients c on c.id::text = e.entity_id
   where e.entity_type = 'fulfillment_client'
     and e.visibility = 'shared_with_partner'
     and c.public_id = p_public_id
     and c.outsourcing_group_id = public.partner_group_of_user()
   order by e.created_at desc
   limit greatest(coalesce(p_limit, 50), 1)
$function$;
revoke execute on function public.my_partner_client_timeline(text, integer) from public, anon;
grant execute on function public.my_partner_client_timeline(text, integer) to authenticated;

/** Documents BES deliberately shared, filed against that client. */
create or replace function public.my_partner_client_files(p_public_id text)
returns table(id uuid, name text, path text, size_bytes bigint, mime_type text, shared_at timestamptz)
language sql stable security definer set search_path = public as $function$
  select f.id, f.name, f.path, f.size_bytes, f.mime_type, coalesce(f.shared_at, f.created_at)
    from public.files f
    join public.fulfillment_clients c on c.id::text = f.entity_id
   where f.entity_type = 'fulfillment_client'
     and f.shared_with_partner
     and c.public_id = p_public_id
     and c.outsourcing_group_id = public.partner_group_of_user()
   order by coalesce(f.shared_at, f.created_at) desc
   limit 100
$function$;
revoke execute on function public.my_partner_client_files(text) from public, anon;
grant execute on function public.my_partner_client_files(text) to authenticated;
