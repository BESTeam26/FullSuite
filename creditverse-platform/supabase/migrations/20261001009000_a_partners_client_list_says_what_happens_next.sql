-- The partner's client list says what happens next, and nothing internal
-- (PARTNER_PORTAL_DOCTRINE addendum, Dee 2026-10-01): Client · Current
-- Status · Round · Last Update · Next Step · Action Needed from Partner.
-- The internal department and the department's own status text leave the
-- projection; a partner-safe next step replaces them, derived in one place
-- from the same status rule the CreditOps queue uses. The timeline names a
-- BES person only when that person is intentionally partner-facing (a live
-- partner assignment) or is one of the partner's own contacts.
--
-- "If the Partner does not need a field to make a decision or take an
-- action, do not expose it."
begin;

-- ── 1. What happens next, from the department status (one rule) ─────────
-- Keys, not prose: the portal words them. The closed set and the "clock
-- belongs to somebody else" set are the ones creditops_status_is_actionable
-- already knows; this only says WHOSE clock.
create or replace function public.creditops_partner_next_step(p_department public.fulfillment_department, p_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_status is null then 'not_started'
    when upper(trim(p_status)) in ('BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED', 'SUPPORT RESOLVED',
                                   'ONBOARDING READY FOR ROUND 1', 'OB READY FOR R1', 'PARTNER ENDORSED', 'COMPLETED') then 'completed'
    when upper(trim(p_status)) = 'ARCHIVED / INACTIVE' then 'closed'
    when upper(trim(p_status)) = 'ROUND SENT - AWAITING RESULTS' or upper(trim(p_status)) like 'ROUND % SENT%' then 'waiting_for_results'
    when upper(trim(p_status)) = 'WAITING FOR PARTNER APPROVAL' then 'waiting_on_partner'
    when upper(trim(p_status)) in ('WAITING CLIENT RESPONSE', 'WAITING ON CLIENT', 'CM AWAITING RESPONSE', 'DOCS PENDING', 'FOR CLIENT CONFIRMATION') then 'waiting_on_client'
    else 'in_progress'
  end
$$;
revoke all on function public.creditops_partner_next_step(public.fulfillment_department, text) from public, anon;
grant execute on function public.creditops_partner_next_step(public.fulfillment_department, text) to authenticated;
comment on function public.creditops_partner_next_step(public.fulfillment_department, text) is
  'The partner-safe next step for a department status: not_started · in_progress · waiting_for_results · waiting_on_client · waiting_on_partner · completed · closed. The portal words it; nothing else reads the internal status text.';

-- ── 2. The list and the detail, without the department ──────────────────
drop function if exists public.my_partner_clients(boolean);
create or replace function public.my_partner_clients(p_include_closed boolean default false)
returns table(
  public_id text, name text, email text, status text, round text, open_items integer, lifecycle text,
  last_activity_at timestamptz, processed_on date, created_at timestamptz,
  next_step text, waiting boolean, action_needed boolean, action_title text
)
language sql stable security definer set search_path = public as $function$
  select c.public_id, c.name, c.email::text, c.status::text, c.round::text,
         c.open_items, c.lifecycle::text, c.last_activity_at, c.processed_on, c.created_at,
         public.creditops_partner_next_step(d.department, d.status),
         d.status is not null and not public.creditops_status_is_actionable(d.department, d.status),
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

drop function if exists public.my_partner_client(text);
create or replace function public.my_partner_client(p_public_id text)
returns table(
  public_id text, name text, email text, phone text,
  status text, round text, lifecycle text, open_items integer,
  created_at timestamptz, last_activity_at timestamptz, processed_on date,
  next_step text, waiting boolean,
  action_needed boolean, action_id uuid, action_title text, action_detail text, action_kind text
)
language sql stable security definer set search_path = public as $function$
  select c.public_id, c.name, c.email::text, c.phone,
         c.status::text, c.round::text, c.lifecycle::text, c.open_items,
         c.created_at, c.last_activity_at, c.processed_on,
         public.creditops_partner_next_step(d.department, d.status),
         d.status is not null and not public.creditops_status_is_actionable(d.department, d.status),
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

-- ── 3. The timeline names only partner-facing people ────────────────────
create or replace function public.my_partner_client_timeline(p_public_id text, p_limit integer default 50)
returns table(id bigint, happened_at timestamptz, action text, detail text, actor_name text)
language sql stable security definer set search_path = public as $function$
  select e.id, e.created_at, e.action, e.detail,
         case
           /* A BES person named on this partner's account, or one of the
              partner's own contacts. Anybody else is just "BES". */
           when e.actor_id in (select a.user_id from public.partner_assignments a
                                where a.group_id = c.outsourcing_group_id and a.ended_on is null)
             or e.actor_id in (select pc.user_id from public.partner_contacts pc
                                where pc.group_id = c.outsourcing_group_id and pc.user_id is not null)
           then e.actor_name
           else null
         end
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

commit;
