-- =============================================================================
-- The access profiles become real preset packages (Dee, 2026-09-09: "Dee
-- should not have to manually flip 30 to 50 permission switches every time she
-- adds an employee").
--
-- ONE canonical matrix, here, as rows — not restated in the invite form, the
-- People page, the Access page, navigation or the route guards (§17). The
-- resolver already consults it between a person's own overrides and the role
-- defaults (0266); this fills it in properly.
--
-- ── WHY EXPLICIT `false` ROWS ──────────────────────────────────────────────
--
-- A missing row and a `false` row resolve the same way — denied. They read
-- differently to a person: "nobody has said" versus "the Agent profile
-- deliberately withholds this". §19 asks the Access screen to explain each
-- capability's source, so the deliberate denials are STATED. Sensitive
-- capabilities in particular are never silently absent (§30).
--
-- ── WHAT NO PROFILE GRANTS ─────────────────────────────────────────────────
--
-- Module entry keys (creditops.clients.view, crm.projects.view,
-- fundingops.files.view, talentops.view) are false for every profile: a
-- CreditOps agent must never see BES CRM by being an agent (§13/§14). The
-- module a person works is a deliberate per-person grant, made at invite time
-- or on their Access tab.
--
-- Personal surfaces — My Work, My Time, EOD, Notifications, Communication,
-- Knowledge, Announcements, Calendar — carry no capability at all: they are
-- access:"user" routes, so every profile including Custom has them already.
-- That is the "safe personal baseline" of §15, and it needs no rows.
-- =============================================================================

delete from public.agency_profile_permissions;

insert into public.agency_profile_permissions (profile, key, allowed) values
  -- ── MANAGER: runs an authorized slice. Scope still decides the records. ──
  ('manager', 'ops.manage',              true),   -- the retired manager rank
  ('manager', 'team.manage',             true),
  ('manager', 'org.structure.view',      true),
  ('manager', 'reports.view',            true),
  ('manager', 'partners.view',           true),
  ('manager', 'partners.operations',     true),
  ('manager', 'partners.assignments',    true),
  ('manager', 'partners.contacts',       true),
  ('manager', 'partners.clients',        true),
  ('manager', 'partners.files.view',     true),
  ('manager', 'partners.files.upload',   true),
  -- Deliberately withheld from a manager (§8, §30–§35):
  ('manager', 'finance.dashboard.view',  false),
  ('manager', 'expenses.view',           false),
  ('manager', 'expenses.manage',         false),
  ('manager', 'payroll.view',            false),
  ('manager', 'payroll.manage',          false),
  ('manager', 'partners.financials.view', false),
  ('manager', 'partners.financials.edit', false),
  ('manager', 'partners.invoices.view',  false),
  ('manager', 'partners.invoices.manage', false),
  ('manager', 'partners.payments.record', false),
  ('manager', 'partners.revenue.record', false),
  ('manager', 'partners.credentials.view', false),
  ('manager', 'partners.credentials.manage', false),
  ('manager', 'people.documents.manage', false),
  ('manager', 'settings.manage',         false),
  ('manager', 'team.permissions',        false),
  ('manager', 'org.structure.manage',    false),
  ('manager', 'billing.view',            false),
  ('manager', 'billing.manage',          false),
  ('manager', 'communication.audit',     false),
  ('manager', 'access.preview_as_user',  false),
  ('manager', 'reports.export',          false),
  ('manager', 'creditops.clients.view',  false),
  ('manager', 'crm.projects.view',       false),
  ('manager', 'fundingops.files.view',   false),
  ('manager', 'talentops.view',          false),

  -- ── TEAM LEAD: their team. The team surfaces come from the is_lead FACT. ──
  ('team_lead', 'partners.view',         true),
  ('team_lead', 'partners.operations',   true),
  ('team_lead', 'partners.clients',      true),
  ('team_lead', 'partners.files.view',   true),
  ('team_lead', 'partners.files.upload', true),
  ('team_lead', 'reports.view',          true),
  -- No agency-wide management, and nothing sensitive (§10):
  ('team_lead', 'ops.manage',            false),
  ('team_lead', 'team.manage',           false),
  ('team_lead', 'team.permissions',      false),
  ('team_lead', 'org.structure.view',    false),
  ('team_lead', 'org.structure.manage',  false),
  ('team_lead', 'partners.assignments',  false),
  ('team_lead', 'finance.dashboard.view', false),
  ('team_lead', 'expenses.view',         false),
  ('team_lead', 'payroll.view',          false),
  ('team_lead', 'payroll.manage',        false),
  ('team_lead', 'partners.financials.view', false),
  ('team_lead', 'partners.credentials.view', false),
  ('team_lead', 'partners.credentials.manage', false),
  ('team_lead', 'people.documents.manage', false),
  ('team_lead', 'settings.manage',       false),
  ('team_lead', 'billing.view',          false),
  ('team_lead', 'communication.audit',   false),
  ('team_lead', 'reports.export',        false),
  ('team_lead', 'creditops.clients.view', false),
  ('team_lead', 'crm.projects.view',     false),
  ('team_lead', 'fundingops.files.view', false),
  ('team_lead', 'talentops.view',        false),

  -- ── AGENT: their own work, and the partners they are assigned. ──────────
  ('agent', 'partners.view',             true),
  ('agent', 'partners.clients',          true),
  ('agent', 'partners.files.view',       true),
  ('agent', 'partners.files.upload',     true),
  -- Everything else off, and stated so the screen can explain it (§12):
  ('agent', 'ops.manage',                false),
  ('agent', 'team.manage',               false),
  ('agent', 'team.permissions',          false),
  ('agent', 'org.structure.view',        false),
  ('agent', 'org.structure.manage',      false),
  ('agent', 'partners.operations',       false),
  ('agent', 'partners.assignments',      false),
  ('agent', 'partners.contacts',         false),
  ('agent', 'reports.view',              false),
  ('agent', 'reports.export',            false),
  ('agent', 'finance.dashboard.view',    false),
  ('agent', 'expenses.view',             false),
  ('agent', 'payroll.view',              false),
  ('agent', 'payroll.manage',            false),
  ('agent', 'partners.financials.view',  false),
  ('agent', 'partners.credentials.view', false),
  ('agent', 'partners.credentials.manage', false),
  ('agent', 'people.documents.manage',   false),
  ('agent', 'settings.manage',           false),
  ('agent', 'billing.view',              false),
  ('agent', 'communication.audit',       false),
  ('agent', 'creditops.clients.view',    false),
  ('agent', 'crm.projects.view',         false),
  ('agent', 'fundingops.files.view',     false),
  ('agent', 'talentops.view',            false),

  -- ── CUSTOM: the safe baseline. Everything explicit, nothing assumed. ────
  ('custom', 'ops.manage',               false),
  ('custom', 'team.manage',              false),
  ('custom', 'team.permissions',         false),
  ('custom', 'org.structure.view',       false),
  ('custom', 'org.structure.manage',     false),
  ('custom', 'partners.view',            false),
  ('custom', 'partners.clients',         false),
  ('custom', 'partners.operations',      false),
  ('custom', 'partners.assignments',     false),
  ('custom', 'partners.contacts',        false),
  ('custom', 'partners.files.view',      false),
  ('custom', 'partners.files.upload',    false),
  ('custom', 'reports.view',             false),
  ('custom', 'reports.export',           false),
  ('custom', 'finance.dashboard.view',   false),
  ('custom', 'expenses.view',            false),
  ('custom', 'payroll.view',             false),
  ('custom', 'payroll.manage',           false),
  ('custom', 'partners.financials.view', false),
  ('custom', 'partners.credentials.view', false),
  ('custom', 'partners.credentials.manage', false),
  ('custom', 'people.documents.manage',  false),
  ('custom', 'settings.manage',          false),
  ('custom', 'billing.view',             false),
  ('custom', 'communication.audit',      false),
  ('custom', 'creditops.clients.view',   false),
  ('custom', 'crm.projects.view',        false),
  ('custom', 'fundingops.files.view',    false),
  ('custom', 'talentops.view',           false);

/**
 * Reset a person to their profile's defaults — the "RESET TO PROFILE
 * DEFAULTS" of §20. Removes their explicit exceptions so the preset alone
 * decides; audited, because deliberate permissions are being discarded.
 * Keeping them is the other option and needs no writer: doing nothing.
 */
create or replace function public.reset_member_to_profile(p_membership uuid)
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_user uuid; v_profile public.access_profile; v_role public.agency_role;
  v_actor text; n integer;
begin
  select m.agency_id, m.user_id, m.access_profile, m.role
    into v_agency, v_user, v_profile, v_role
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then raise exception 'Member not found'; end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency administrator can reset access' using errcode = '42501';
  end if;

  delete from public.agency_member_permissions where membership_id = p_membership;
  get diagnostics n = row_count;

  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  insert into public.activity_events
    (agency_id, entity_type, entity_id, actor_id, actor_name, action, field,
     previous_value, new_value, visibility)
  values (v_agency, 'agency_member', v_user::text, auth.uid(), v_actor,
          'Access reset to profile defaults', 'permissions',
          n || ' exception' || case when n = 1 then '' else 's' end || ' removed',
          coalesce(v_profile::text, v_role::text), 'bes_internal');
  return n;
end $function$;

revoke execute on function public.reset_member_to_profile(uuid) from public, anon;
grant execute on function public.reset_member_to_profile(uuid) to authenticated;
