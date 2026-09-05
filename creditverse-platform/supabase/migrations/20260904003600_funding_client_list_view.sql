-- Separation step 3: the FundingOps Company workspace gains an operational
-- "Client List" view (client, current department, work status, assignee, open
-- work, SLA). The view catalogue the role/view configuration validates against
-- is mirrored here (see fundingops-partners.ts FUNDING_PARTNER_VIEWS).
create or replace function public.workspace_view_ids(p_product public.product_key)
returns text[] language sql immutable as $$
  select case p_product
    when 'creditOps' then array['dashboard','sops-logins','main-list','dispute-queue','onboarding-queue','support-queue','escalation-queue','complaints-queue','bureau-queue']
    when 'fundingOps' then array['dashboard','sops-logins','client-list','deal-list','readiness','documents','submissions','stipulations','offers','funded']
    else '{}'::text[] end
$$;
