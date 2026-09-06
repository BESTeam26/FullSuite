-- 0089 — the first-run guides, in one round trip each.
--
-- Two different people arrive at an empty-looking workspace:
--
--   • the owner who signed up, who has a company to set up;
--   • somebody who was invited into a company that is already set up, and
--     whose only setup is their own profile.
--
-- Both guides are derived from records that actually exist — never from a
-- "completed onboarding" flag, which drifts the moment someone undoes a step
-- or a second administrator does it instead.
--
-- Why a function rather than the eight queries the card used to make: it runs
-- on Home, for every administrator, on every visit. Eight bounded queries is
-- still eight round trips before the page settles (rule 14). One `select` of
-- scalar sub-selects is one.
--
-- Authorization is the caller's own throughout: SECURITY DEFINER is used only
-- so the counts can be taken without eight policy evaluations, and the first
-- thing it does is ask can_view_org(). A caller who may not see the
-- organization gets nothing.

create or replace function public.organization_first_run(p_org uuid)
returns table (
  branding_set     boolean,
  teammates        integer,
  clients          integer,
  credit_reports   integer,
  letter_templates integer,
  kpis_chosen      integer,
  funding_files    integer,
  hub_choices      integer,
  automations      integer
)
language sql stable security definer set search_path = public as $$
  select
    -- "Branded" means a logo or a colour was actually chosen, not that the
    -- column stopped being null: an empty object is not branding.
    coalesce(nullif(o.branding ->> 'logoUrl', ''), nullif(o.branding ->> 'primaryColor', '')) is not null,
    (select count(*) from public.org_memberships m
      where m.organization_id = p_org and m.user_id <> auth.uid())::integer
      + (select count(*) from public.invitations i
          where i.organization_id = p_org and i.accepted_at is null and i.expires_at > now())::integer,
    (select count(*) from public.fulfillment_clients c where c.organization_id = p_org)::integer,
    (select count(*) from public.credit_reports r where r.organization_id = p_org)::integer,
    -- The organization's OWN library. BES ships defaults every organization can
    -- read, and counting those would tick the step before they wrote anything.
    (select count(*) from public.letter_templates t where t.organization_id = p_org)::integer,
    (select count(*) from public.organization_kpi_settings k where k.organization_id = p_org and k.enabled)::integer,
    (select count(*) from public.funding_files f
       join public.funding_clients fc on fc.id = f.client_id
      where fc.organization_id = p_org)::integer,
    -- Any decision counts, including switching something off: the step is
    -- "you have looked at this", not "you enabled things".
    (select count(*) from public.organization_hub_modules h where h.organization_id = p_org)::integer,
    (select count(*) from public.organization_automations a where a.organization_id = p_org and a.enabled)::integer
  from public.organizations o
  where o.id = p_org and public.can_view_org(p_org)
$$;
revoke all on function public.organization_first_run(uuid) from public, anon;
grant execute on function public.organization_first_run(uuid) to authenticated;

/**
 * The invited person's own first run: what is still missing from their profile.
 * Reads nothing but their own row, so there is nothing to authorize beyond
 * being signed in.
 */
create or replace function public.member_first_run()
returns table (
  avatar_set        boolean,
  phone_set         boolean,
  preferred_name_set boolean,
  birthday_shared   boolean
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(p.avatar_path, p.avatar_url) is not null,
    nullif(trim(p.phone), '') is not null,
    nullif(trim(p.preferred_name), '') is not null,
    -- Shared, not merely recorded: a birthday nobody may see is not shared.
    (p.birth_month is not null and p.birth_day is not null and p.birthday_visible)
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.member_first_run() from public, anon;
grant execute on function public.member_first_run() to authenticated;
