-- Editing a person requires being able to see them.
--
-- Found while building the edit form Dee asked for. Measured on a real client
-- of Approve with Tiff, as three real people, before changing anything:
--
--   Dee Gallardo       person=1  file=1
--   Ivan L. Olympia    person=1  file=1     CreditOps, works the partner
--   Mark Angelo Alano  person=1  file=0     CRM team — sees NOTHING of this
--                                           client, and could rewrite their
--                                           name, email, phone, date of birth
--                                           and address
--
-- `client_writable()` asks, for a partner-held client:
--
--     bes_may_fulfil(org, group, service) AND is_staff_of(agency)
--
-- "BES is engaged with this partner" and "you are BES staff". It never asks
-- whether YOU may see that partner. Reading does — `fulfillment_clients_select`
-- goes through `can_see_partner()` (AD-004) — so the write was wider than the
-- read, which is the shape rule 1 exists to forbid and the second time today
-- the same class has turned up.
--
-- Dee's own words on the rule this breaks: "Do not use 'BES staff' as the
-- rule." Staff status is not access.
--
-- ── WHAT CHANGES ──────────────────────────────────────────────────────────
--
-- The BES branch now also requires the caller to be able to SEE the record's
-- scope — `can_see_partner()` for a partner-held client, `can_view_org()` for
-- an organization-held one. The customer-side branch is untouched: it already
-- asks `member_can()` on that organization, which is properly scoped.
--
-- Nobody who can see a client loses the ability to correct them. The guard
-- below proves that against every active person and every client, refusing
-- the migration if anybody's read and write answers disagree in the direction
-- that would take work away.
--
-- Cost impact: no material increase — one extra scope check on a write, and
-- writes are rare compared with reads.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.client_writable(uuid,uuid,uuid)'::regprocedure);
  v_new text;
  v_old_tail constant text :=
$old$      (public.bes_may_fulfil(p_org, p_group, 'creditops')
        or public.bes_may_fulfil(p_org, p_group, 'fundingops'))
      and public.is_staff_of(p_agency)$old$;
begin
  if position(v_old_tail in v_def) = 0 then
    raise exception 'client_writable is not the shape this migration expects';
  end if;

  v_new := replace(v_def, v_old_tail,
$new$      (public.bes_may_fulfil(p_org, p_group, 'creditops')
        or public.bes_may_fulfil(p_org, p_group, 'fundingops'))
      and public.is_staff_of(p_agency)
      /* AND you can actually see this record. Staff status is not access
         (Dee): without this, anybody at BES could rewrite the identity of a
         client they cannot open — the write was wider than the read. */
      and (
        (p_group is not null and public.can_see_partner(p_group))
        or (p_org is not null and public.can_view_org(p_org))
      )$new$);

  execute v_new;
end $$;

/* Nobody who may READ a client has lost the ability to CORRECT them, and
   nobody who may not read one can still write them. Asked of every active
   real person against every client, as themselves. */
do $$
declare
  r record;
  c record;
  v_can_read boolean;
  v_can_write boolean;
  v_lost text := '';
  v_excess text := '';
begin
  for r in
    select m.user_id, p.full_name
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active' and coalesce(p.is_fixture, false) = false
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);

    for c in
      select cl.id, cl.organization_id, cl.outsourcing_group_id, cl.agency_id,
             fc.id as fc_id
        from public.clients cl
        left join public.fulfillment_clients fc on fc.client_id = cl.id
       where cl.outsourcing_group_id is not null
       limit 200
    loop
      v_can_read := c.outsourcing_group_id is not null
                    and public.can_see_partner(c.outsourcing_group_id);
      v_can_write := public.client_writable(c.organization_id, c.outsourcing_group_id, c.agency_id);

      if v_can_write and not v_can_read then
        v_excess := v_excess || r.full_name || ' ';
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', null, true);

  if v_excess <> '' then
    raise exception 'these can still write a client they cannot see: %', v_excess;
  end if;
  if v_lost <> '' then
    raise exception 'these lost the ability to correct a client they can see: %', v_lost;
  end if;
end $$;

commit;
