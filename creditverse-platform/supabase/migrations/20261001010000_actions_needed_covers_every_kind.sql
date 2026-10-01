-- Actions Needed covers every kind the doctrine names (Dee, 2026-10-01):
-- missing documents, client confirmation, approval, monitoring login,
-- billing action, agreement/signature, project approval, information
-- request. Three of the eight were never asks BES had to type — an unsigned
-- agreement, an overdue invoice and an open project requirement already
-- exist as canonical rows — so the list is a UNION over those sources, not
-- a copy of them, and the summary badge counts the same list.
begin;

-- ── 1. Two more kinds BES may ask for ───────────────────────────────────
alter table public.partner_action_items drop constraint if exists partner_action_items_kind_check;
alter table public.partner_action_items add constraint partner_action_items_kind_check
  check (kind in ('partner_confirmation', 'document_required', 'question', 'information_request',
                  'content_approval', 'campaign_approval', 'client_confirmation', 'monitoring_login'));

-- ── 2. Everything the partner must act on, from the canonical sources ───
create or replace function public.my_partner_actions_needed()
returns table (
  kind text, source text, source_id text, title text, detail text,
  client_name text, requested_at timestamptz, due_on date, href text
)
language sql stable security definer set search_path = public as $function$
  /* Asks BES raised: documents, confirmations, approvals, logins, questions. */
  select a.kind, 'action'::text, a.id::text, a.title, a.detail, c.name, a.requested_at, null::date, null::text
    from public.partner_action_items a
    left join public.fulfillment_clients c on c.id = a.fulfillment_client_id
   where a.group_id = public.partner_group_of_user() and a.status = 'open'
  union all
  /* An agreement waiting for a signature. The signing page is the link. */
  select 'signature', 'signature_request', s.id::text, s.title,
         'Please review and sign.', null, s.sent_at, s.expires_at::date, '/sign/' || s.token::text
    from public.signature_requests s
   where s.outsourcing_group_id = public.partner_billing_group_of_user()
     and s.status in ('sent', 'viewed') and (s.expires_at is null or s.expires_at > now())
  union all
  /* An invoice past its due date with a balance. */
  select 'billing', 'invoice', i.id::text, 'Invoice ' || i.invoice_number || ' is past due',
         'Balance ' || to_char(public.invoice_balance_cents(i.id) / 100.0, 'FM$999,999,990.00') || ', due ' || to_char(i.due_date, 'FMMon DD, YYYY') || '.',
         null, i.issue_date::timestamptz, i.due_date, '/partner/billing'
    from public.partner_invoices i
   where i.group_id = public.partner_billing_group_of_user()
     and i.status not in ('void', 'cancelled', 'draft', 'paid')
     and i.due_date < current_date
     and public.invoice_balance_cents(i.id) > 0
  union all
  /* Something BES needs from them for a build. */
  select 'project_approval', 'requirement', r.id::text, r.label, r.detail, p.name, r.created_at, null, '/partner/services'
    from public.crm_client_requirements r
    join public.crm_projects p on p.id = r.project_id
   where p.partner_group_id = public.partner_group_of_user()
     and p.archived_at is null and r.satisfied_at is null
  order by 7 desc
$function$;
revoke execute on function public.my_partner_actions_needed() from public, anon;
grant execute on function public.my_partner_actions_needed() to authenticated;
comment on function public.my_partner_actions_needed() is
  'Everything the signed-in partner must act on, as one list over the canonical sources: open asks (partner_action_items), unsigned agreements (signature_requests), past-due invoices (partner_invoices), open build requirements (crm_client_requirements). No copies; the summary badge counts this list.';

-- ── 3. The badge counts the same list ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_partner_portal_summary()
 RETURNS TABLE(group_id uuid, partner_name text, suspended boolean, active_clients integer, actions_needed integer, active_services integer, unread_messages integer, balance_cents bigint, overdue_invoices integer, has_agreements boolean, has_account_credit boolean, has_processing_credits boolean, has_referrals boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select public.partner_billing_group_of_user() as gid)
  select g.id,
         g.name,
         public.partner_is_suspended(g.id),
         (select count(*)::int from public.my_partner_clients(false)),
         (select count(*)::int from public.my_partner_actions_needed()),
         (select count(*)::int from public.fulfillment_engagements e
           where e.outsourcing_group_id = g.id
             and public.engagement_is_live(e.status, e.effective_from, e.effective_to)),
         /* Unread comes from the canonical `visible_channels`, the same call
            the Messages screen makes — not a second count that could disagree
            with the badge beside it. */
         coalesce((select sum(v.unread)::int from public.visible_channels() v), 0),
         coalesce((select sum(public.invoice_balance_cents(i.id)) from public.partner_invoices i
                    where i.group_id = g.id and i.status not in ('void','cancelled','draft')), 0),
         coalesce((select count(*)::int from public.partner_invoices i
                    where i.group_id = g.id and i.status = 'overdue'), 0),
         exists (select 1 from public.signature_requests s where s.outsourcing_group_id = g.id),
         exists (select 1 from public.partner_account_credit_ledger l where l.group_id = g.id),
         exists (select 1 from public.partner_credit_ledger l where l.group_id = g.id),
         /* No partner referral model exists yet, so this is honestly false
            rather than a menu item pointing at nothing. */
         false
    from me join public.outsourcing_groups g on g.id = me.gid
$function$
;

commit;
