-- =============================================================================
-- Two more partner-facing reads: their agreements, and BES's notices to them.
--
-- Both are projections of canonical records, not new stores. Agreements are
-- `signature_requests` — the same rows the document builder creates and the
-- signing page fills in. Updates are `announcements` plus the activity feed
-- `my_partner_updates` already returns.
--
-- ── REFERRALS ARE DELIBERATELY ABSENT ───────────────────────────────────────
--
-- Dee's spec has a conditional Referrals page. `referral_codes` and
-- `referral_attributions` are ORGANIZATION-scoped — there is no partner
-- referral relationship in the model today. Rather than invent one so a menu
-- item can exist, the portal hides Referrals entirely, which is what "Hide
-- navigation completely if not relevant" asks for. When BES actually starts a
-- partner referral programme it gets a real model first.
-- =============================================================================

/**
 * The partner's agreements — what they have signed, and what is waiting.
 *
 * Uses the BILLING resolver, not the service one: a suspended partner must
 * still reach their agreements (Dee: "They may still access Billing,
 * Agreements, Messages, Account Settings").
 *
 * `rendered_html` and `signed_html` are deliberately NOT returned. They are
 * large, and the signing page already serves the document through its own
 * token. This is the list, not the contents.
 */
create or replace function public.my_partner_agreements()
returns table(
  id uuid, title text, status text, service text,
  sent_at timestamptz, viewed_at timestamptz, signed_at timestamptz, expires_at timestamptz,
  signer_name text, signature_name text, token uuid
)
language sql stable security definer set search_path = public as $function$
  select s.id, s.title, s.status::text,
         /* What it is about, when the template says. */
         (select t.name from public.document_templates t where t.id = s.template_id),
         s.sent_at, s.viewed_at, s.signed_at, s.expires_at,
         s.signer_name, s.signature_name,
         /* Only while it is still signable: a token on a completed agreement
            is a live signing link nobody needs. */
         case when s.status = 'sent' then s.token else null end
    from public.signature_requests s
   where s.outsourcing_group_id = public.partner_billing_group_of_user()
   order by coalesce(s.signed_at, s.sent_at, s.created_at) desc
   limit 100
$function$;
revoke execute on function public.my_partner_agreements() from public, anon;
grant execute on function public.my_partner_agreements() to authenticated;

/**
 * BES's notices to its partners.
 *
 * Only `partners` and `all_organizations`. `bes_internal` is staff-only and
 * `organization` belongs to a specific SaaS tenant — neither is a partner's to
 * read, and the filter is here rather than in the caller so no screen can
 * forget it.
 */
create or replace function public.my_partner_announcements(p_limit integer default 20)
returns table(
  id uuid, title text, body text, tag text, pinned boolean, published_at timestamptz
)
language sql stable security definer set search_path = public as $function$
  select a.id, a.title, a.body, a.tag, a.pinned, a.published_at
    from public.announcements a
   where public.partner_billing_group_of_user() is not null
     and a.audience in ('partners', 'all_organizations')
     and a.published_at is not null
     and a.archived_at is null
   order by a.pinned desc, a.published_at desc
   limit greatest(coalesce(p_limit, 20), 1)
$function$;
revoke execute on function public.my_partner_announcements(integer) from public, anon;
grant execute on function public.my_partner_announcements(integer) to authenticated;

/**
 * One call for everything the portal's navigation needs to decide what to show.
 *
 * Dee: "Navigation should adapt to the Partner… Hide navigation completely if
 * not relevant." Asking six questions to draw a menu would be six round trips
 * before the first paint (rule 14), so it is one.
 */
create or replace function public.my_partner_portal_summary()
returns table(
  group_id uuid,
  partner_name text,
  suspended boolean,
  active_clients integer,
  actions_needed integer,
  active_services integer,
  unread_messages integer,
  balance_cents bigint,
  overdue_invoices integer,
  has_agreements boolean,
  has_account_credit boolean,
  has_processing_credits boolean,
  has_referrals boolean
)
language sql stable security definer set search_path = public as $function$
  with me as (select public.partner_billing_group_of_user() as gid)
  select g.id,
         g.name,
         public.partner_is_suspended(g.id),
         (select count(*)::int from public.my_partner_clients(false)),
         (select count(*)::int from public.my_partner_actions() where status = 'open'),
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
$function$;
revoke execute on function public.my_partner_portal_summary() from public, anon;
grant execute on function public.my_partner_portal_summary() to authenticated;
