-- 0125 — remove the last two DEFINER→INVOKER-helper calls, so the invariant
-- holds with no exceptions.
--
-- 0124 fixed the one that was actually leaking (`client_birthdays`) and
-- withdrew the grants on two functions that were reachable when they should
-- not have been. Two structural instances remained: `ai_available_credits` and
-- `ai_record_usage` both call `ai_credit_balance`, which is SECURITY INVOKER
-- and works by letting RLS scope `ai_credit_ledger`.
--
-- Neither is a leak today — both callers are DEFINER and gate access
-- themselves, and the sum is already narrowed by `organization_id = p_org`.
-- But the pattern is the trap, and an invariant with two documented exceptions
-- is an invariant nobody can enforce. The sum is four lines; inlining it costs
-- nothing and lets the rule be absolute:
--
--   NO SECURITY DEFINER function calls a helper whose correctness depends on
--   the caller's RLS.
--
-- `ai_can_use` already inlined the same sum, for the same reason. This makes
-- the other two consistent with it.

create or replace function public.ai_available_credits(p_org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  /* Inlined rather than calling ai_credit_balance(): that helper is INVOKER
     and would stop being RLS-scoped inside this DEFINER function. */
  select coalesce((select sum(delta_credits) from public.ai_credit_ledger where organization_id = p_org), 0)
       - public.ai_reserved_credits(p_org)
$$;
revoke all on function public.ai_available_credits(uuid) from public, anon, authenticated;

create or replace function public.ai_record_usage(
  p_org uuid, p_user uuid, p_feature text, p_model text,
  p_input integer, p_output integer, p_cached integer, p_request_id text,
  p_product public.product_key default null
) returns table (credits_charged numeric, provider_cost_cents numeric, balance numeric)
language plpgsql security definer set search_path = public as $$
declare pol public.ai_pricing_policy%rowtype; v_usd numeric; v_cost_cents numeric; v_credits numeric; v_event uuid;
begin
  select * into pol from public.ai_pricing_policy
   where model = p_model and effective_from <= now() and (effective_until is null or effective_until > now())
   order by effective_from desc limit 1;
  if pol.id is null then raise exception 'No pricing policy in force for model %', p_model using errcode = '22023'; end if;
  v_usd := (p_input * pol.input_cost_per_million + p_output * pol.output_cost_per_million + p_cached * pol.cached_cost_per_million) / 1000000.0;
  v_cost_cents := round(v_usd * 100, 4);
  v_credits := ceil(v_usd * pol.markup_multiplier * pol.credits_per_usd * 100) / 100.0;
  insert into public.ai_usage_events (organization_id, user_id, product, feature_key, model, input_tokens, output_tokens, cached_tokens, provider_cost_cents, credits_charged, request_id)
  values (p_org, p_user, p_product, p_feature, p_model, p_input, p_output, p_cached, v_cost_cents, v_credits, p_request_id) returning id into v_event;
  insert into public.ai_credit_ledger (organization_id, delta_credits, kind, reference, created_by)
  values (p_org, -v_credits, 'usage', v_event::text, p_user);
  -- Inlined for the same reason as above.
  return query select v_credits, v_cost_cents,
    coalesce((select sum(delta_credits) from public.ai_credit_ledger where organization_id = p_org), 0);
end $$;
revoke all on function public.ai_record_usage(uuid, uuid, text, text, integer, integer, integer, text, public.product_key) from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, uuid, text, text, integer, integer, integer, text, public.product_key) to service_role;
