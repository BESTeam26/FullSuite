-- `not null` is not `true`, and that let anybody pay.
--
-- `may_act_on_partner_billing` was written as:
--
--     select exists (...) and ( A or B or C )
--
-- where B is `is_partner_contact_of(p_group)`, which resolves
-- `p_group = partner_group_of_user()`. Called with the service role — which is
-- how the payments function calls it — `auth.uid()` is null, so
-- `partner_group_of_user()` is null and B is NULL, not false.
--
-- `false or NULL or false` is NULL. The function returned NULL. And every
-- caller guards with `if not public.may_act_on_partner_billing(...) then raise`
-- — and `not NULL` is NULL, which is not true, so the raise never fired and
-- the call went through.
--
-- Measured, not reasoned about: the card-payments probe's checks 12 and 13
-- ("another partner's contact cannot pay this partner's invoice", "nobody at
-- all cannot pay") both came back ALLOWED. A partner contact could have
-- started a charge against a different partner's invoice.
--
-- The fix is `coalesce(..., false)`: unknown means no. That is rule 1's
-- "default to deny", and the reason this function now cannot return NULL.

create or replace function public.may_act_on_partner_billing(p_group uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    exists (select 1 from public.outsourcing_groups g where g.id = p_group)
    and (
      /* The partner's own active portal contact, named. This is the branch the
         payments function uses, because the service role has no auth.uid(). */
      coalesce(public.partner_group_of_profile(p_actor) = p_group, false)
      /* Or the caller in their own session — the same question, asked when the
         call arrives with a JWT instead. */
      or coalesce(public.is_partner_contact_of(p_group), false)
      /* Or BES staff the owner has delegated partner money to. */
      or coalesce(
           public.is_staff_of((select g.agency_id from public.outsourcing_groups g where g.id = p_group))
           and public.agency_can('partners.payments.record'), false)
    ), false)
$$;

comment on function public.may_act_on_partner_billing(uuid, uuid) is
  'May this person keep a card, switch autopay, or start a charge for this partner? Never returns NULL: unknown means no, because every caller guards with `if not ...`.';

/* Postgres grants EXECUTE to PUBLIC on every new function, and a later
   `grant ... to authenticated` does not replace it. The probe reported
   `PUBLIC,authenticated` on set_partner_autopay — reachable by anon. Same
   lesson as migrations 0003/0004: two independent grants, revoke both. */
revoke all on function public.may_act_on_partner_billing(uuid, uuid) from public;
grant execute on function public.may_act_on_partner_billing(uuid, uuid) to authenticated;

revoke all on function public.set_partner_autopay(uuid, boolean) from public;
grant execute on function public.set_partner_autopay(uuid, boolean) to authenticated;

revoke all on function public.partner_group_of_profile(uuid) from public, authenticated, anon;
