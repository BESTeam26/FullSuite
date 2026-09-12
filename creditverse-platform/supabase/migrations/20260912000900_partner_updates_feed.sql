-- =============================================================================
-- What a partner is allowed to be told has happened.
--
-- Dee, 2026-09-12: "Add a small Recent Updates section. Only Partner-safe
-- updates… Do NOT expose internal BES notes, processor comments, internal
-- assignment changes, raw audit logs, internal SLA calculations, sensitive
-- credentials, employee-only activity."
--
-- ── THE BOUNDARY ALREADY EXISTS ─────────────────────────────────────────────
--
-- `activity_events.visibility` has said `shared_with_partner` since the
-- activity engine was built, and every trigger that writes an entry already
-- decides which it is. So this invents no new classification and adds no new
-- judgement: it reads the rows already marked shareable, for this partner's
-- own clients, and nothing else.
--
-- That is deliberately narrower than "everything about my clients". An entry
-- written `bes_internal` stays internal even though it concerns a client the
-- partner owns — which is the whole point of having marked it.
--
-- ACTOR NAMES ARE OMITTED. A partner does not need to know which BES employee
-- mailed a round, and telling them turns an operational update into workforce
-- information (rule 16). What happened, to whom, and when.
-- =============================================================================

create or replace function public.my_partner_updates(p_limit int default 20)
returns table (
  id bigint, happened_at timestamptz, client_name text, action text, detail text
)
language sql stable security definer set search_path = public as $function$
  select e.id, e.created_at, c.name, e.action, e.detail
    from public.activity_events e
    join public.fulfillment_clients c on c.id::text = e.entity_id
   where e.entity_type = 'fulfillment_client'
     and e.visibility = 'shared_with_partner'
     and c.outsourcing_group_id = public.partner_group_of_user()
     and c.archived_at is null
   order by e.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100))
$function$;

comment on function public.my_partner_updates(int) is
  'Partner-safe activity on this partner''s own clients: rows already marked `shared_with_partner` by the trigger that wrote them. No actor names, no internal entries, no audit rows (Dee, 2026-09-12).';

revoke execute on function public.my_partner_updates(int) from public, anon;
grant execute on function public.my_partner_updates(int) to authenticated;
