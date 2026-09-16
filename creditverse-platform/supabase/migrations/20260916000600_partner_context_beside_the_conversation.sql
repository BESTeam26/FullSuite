-- Who you are talking to, beside the conversation.
--
-- Dee, 2026-09-16: *"For Partner conversations, support an optional right
-- context panel … This is context, not authorization. Do not expose internal
-- data to Partner users. Internal BES users can see richer context according
-- to capability."*
--
-- Both halves of that sentence are enforced here rather than in the panel:
--
--   BES STAFF ONLY, and only for a partner they may already see. `is_agency_staff()`
--   and `can_see_partner()` are the same two predicates that gate the partner
--   record itself, so this shows nothing that was not already reachable — it
--   just saves opening another screen to read it.
--
--   MONEY OBEYS ITS OWN GATE. The outstanding balance is owner-gated through
--   `partners.invoices.view`, exactly as everywhere else. A caller without it
--   gets NULL, and the panel says "Not available" rather than "$0.00" —
--   because zero is a claim, and a hidden figure is not zero.
--
-- SECURITY DEFINER because it reads across five tables whose policies differ;
-- the two guards at the top are what make that safe, and they refuse before
-- anything is read.

create or replace function public.partner_conversation_context(p_group uuid)
returns table (
  partner_name       text,
  lifecycle          text,
  primary_contact    text,
  services           text[],
  assigned_team      text[],
  open_actions       integer,
  active_clients     integer,
  balance_cents      bigint,
  balance_visible    boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_money boolean := public.agency_can('partners.invoices.view');
begin
  /* Not an error — an empty answer. The panel is optional furniture, and a
     conversation whose partner this person may not see simply has none. */
  if not (public.is_agency_staff() and public.can_see_partner(p_group)) then
    return;
  end if;

  return query
  select g.name,
         g.lifecycle::text,
         (select coalesce(c.full_name, c.email) from public.partner_contacts c
           where c.group_id = g.id and c.is_primary and c.status = 'active' limit 1),
         coalesce((select array_agg(distinct coalesce(st.label, ps.service_type) order by coalesce(st.label, ps.service_type))
                     from public.partner_services ps
                     left join public.partner_service_types st on st.code = ps.service_type
                    where ps.group_id = g.id and ps.status in ('active', 'onboarding')), '{}'),
         coalesce((select array_agg(distinct coalesce(p.full_name, p.email) order by coalesce(p.full_name, p.email))
                     from public.partner_assignments a
                     join public.profiles p on p.id = a.user_id
                    where a.group_id = g.id and a.ended_on is null), '{}'),
         (select count(*)::int from public.partner_action_items ai
           where ai.group_id = g.id and ai.status = 'open'),
         (select count(*)::int from public.fulfillment_clients fc
           where fc.outsourcing_group_id = g.id and fc.archived_at is null),
         case when v_money then (
           select coalesce(sum(public.invoice_balance_cents(i.id)), 0)::bigint
             from public.partner_invoices i
            where i.group_id = g.id and i.status not in ('void', 'cancelled', 'draft')
         ) end,
         v_money
    from public.outsourcing_groups g
   where g.id = p_group and g.archived_at is null;
end $$;

comment on function public.partner_conversation_context(uuid) is
  'Context for the panel beside a partner conversation. BES staff only, and only for a partner they may already see; the balance is null unless the caller holds partners.invoices.view.';

grant execute on function public.partner_conversation_context(uuid) to authenticated;
