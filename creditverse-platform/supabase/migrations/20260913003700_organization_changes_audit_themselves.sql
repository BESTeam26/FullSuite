-- 0337 — an organization change writes its own audit row.
--
-- ---------------------------------------------------------------------------
-- FOUND BY THE SQL CONTRACT PROBE, 2026-09-13
--
-- `organizations.ts` calls `log_audit` three times: when an organization is
-- created, when one is updated, and when an entitlement is toggled. Not one of
-- those has ever written a row.
--
-- Migration 0004 revoked `log_audit` from every client role, and it was RIGHT
-- to: "a probe with no membership wrote an arbitrary row into audit_log through
-- log_audit()" (Finding 12). What nobody noticed is that three real callers
-- went with it. The result is silent — the calls do not check their error — so
-- since 2026-09-04 creating an organization, changing one, and enabling or
-- disabling a product have produced NO audit trail at all. Rule 10, broken
-- quietly, by a correct security fix.
--
-- `audit_log` bears it out: `organization.branding_updated` is there, because
-- `merge_organization_branding` calls `log_audit` from INSIDE the database.
-- `organization.created` has never appeared.
--
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER AND NOT A NEW GRANT
--
-- Re-granting `log_audit` would undo Finding 12 and hand every signed-in
-- account the ability to write whatever it likes into the audit trail. 0004
-- already named the alternative: "Postgres does not check EXECUTE when a
-- trigger fires, so revoking from clients costs the triggers nothing."
--
-- So the record is written where the change happens. It cannot be forged by a
-- caller, cannot be forgotten by a screen, and cannot be skipped by a client
-- that writes the table directly — which is exactly how these three writes
-- reach the database today (rule 10: history cannot be skipped by a client).
-- ---------------------------------------------------------------------------

create or replace function public.audit_organization_change()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_action text;
  v_org    uuid;
  v_entity text;
  v_id     text;
begin
  if tg_table_name = 'organizations' then
    v_entity := 'organization';
    v_org    := coalesce(new.id, old.id);
    v_id     := v_org::text;
    v_action := case tg_op when 'INSERT' then 'organization.created'
                           when 'DELETE' then 'organization.deleted'
                           else 'organization.updated' end;
  else
    v_entity := 'product_entitlement';
    v_org    := coalesce(new.organization_id, old.organization_id);
    v_id     := v_org::text || ':' || coalesce(new.product, old.product)::text;
    /* An entitlement row is written with `on conflict do update`, so the
       useful fact is the state it ended in, not which SQL verb got it there. */
    v_action := case
      when tg_op = 'DELETE' then 'entitlement.disabled'
      when coalesce(new.enabled, false) then 'entitlement.enabled'
      else 'entitlement.disabled' end;
  end if;

  /* An UPDATE that changed nothing but `updated_at` is not a fact anybody
     needs in an audit trail (rule 10: no noisy events for harmless actions). */
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then
    return null;
  end if;

  insert into public.audit_log (
    actor_id, agency_id, organization_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    (select agency_id from public.agency_memberships
      where user_id = auth.uid() and status = 'active' limit 1),
    v_org, v_action, v_entity, v_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$function$;
/* Trigger-only, like every other function 0004 locked down. The trigger fires
   regardless; a grant would only reopen Finding 12 from a different door. */
revoke all on function public.audit_organization_change() from public, anon, authenticated;

comment on function public.audit_organization_change() is
  'Writes the audit row for an organization or entitlement change, at the table rather than from the screen — so it cannot be forged by a caller or skipped by one (rule 10; replaces three client `log_audit` calls that 0004 silently disarmed).';

drop trigger if exists organizations_audit on public.organizations;
create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.audit_organization_change();

drop trigger if exists product_entitlements_audit on public.product_entitlements;
create trigger product_entitlements_audit
  after insert or update or delete on public.product_entitlements
  for each row execute function public.audit_organization_change();

-- ---------------------------------------------------------------------------
-- Two stray grants, from the same probe.
--
-- Neither is exploitable today — `set_payroll_settings` refuses a caller
-- without `payroll.manage`, and `crm_project_board` is SECURITY INVOKER so RLS
-- answers for it. Both are revoked anyway, because 0003/0004's lesson is that
-- a function is reachable through TWO grants and leaving one in place means
-- the day somebody relaxes an internal check, the door is already open.
-- ---------------------------------------------------------------------------
revoke all on function public.set_payroll_settings(boolean, integer, integer, integer, integer, text, text)
  from public, anon;
grant execute on function public.set_payroll_settings(boolean, integer, integer, integer, integer, text, text)
  to authenticated;

revoke all on function public.crm_project_board(text) from public, anon;
grant execute on function public.crm_project_board(text) to authenticated;
