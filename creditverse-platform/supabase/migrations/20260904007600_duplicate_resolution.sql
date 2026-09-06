-- 0098 — who resolves a possible duplicate client. C10, and a correction.
--
-- Dee's earlier answer was "the uploader or importer". The formal decision set
-- revises it:
--
--   C10: "Organization admins resolve duplicates for their own data. BES can
--         assist only when engaged or escalated."
--
-- The revision is right, and the reason is worth recording. A duplicate
-- resolution MERGES TWO PEOPLE or splits one into two. Get it wrong and one
-- client sees another client's credit report — the single worst thing this
-- platform could do. The person who happened to run an import at 2am is not
-- the right person to make that call; the organization's administrator is,
-- because they can see both records in full and they answer for the outcome.
--
-- 0092 and 0091 carry comments stating the superseded rule. Migrations that
-- have run are not edited, so this one states the correction and, more to the
-- point, ENFORCES it — the old rule was only ever a comment, and a comment
-- authorizes nothing.

comment on column public.clients.needs_review is
  'Set by the backfill or an import when two records might be the same person but the evidence is only a name. Cleared ONLY through resolve_client_duplicate() — an organization administrator for their own data, or BES staff under a live engagement. Superseded the earlier "whoever imported it" rule (C10, 2026-09-06).';

/**
 * Resolve a flagged client.
 *
 * Deliberately narrow: it clears the flag and records what a person decided.
 * It does NOT merge records. Merging is a separate, heavier operation with its
 * own audit and its own confirmation, and folding it in here would let a
 * routine "yes these are the same" click destroy a second client's history.
 */
create or replace function public.resolve_client_duplicate(
  p_client uuid,
  p_outcome text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
begin
  if p_outcome not in ('distinct_people', 'same_person_merge_requested') then
    raise exception 'Unknown outcome %', p_outcome using errcode = '22023';
  end if;

  select * into c from public.clients where id = p_client;
  if c.id is null then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  /* C10, enforced. An organization administrator for their own data; BES only
     through a live engagement, which is the "engaged or escalated" half. */
  if not (
    (c.organization_id is not null and public.is_org_admin(c.organization_id))
    or (
      (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
        or public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'fundingops'))
      and public.is_staff_of(c.agency_id)
    )
  ) then
    raise exception 'Only an organization administrator resolves a possible duplicate' using errcode = '42501';
  end if;

  update public.clients
     set needs_review = false,
         review_note = case
           when p_outcome = 'same_person_merge_requested'
             then coalesce(nullif(trim(p_note), '') || ' ', '') || 'Merge requested; not yet merged.'
           else nullif(trim(p_note), '')
         end
   where id = p_client;

  perform public.log_audit('client.duplicate_resolved', 'client', p_client::text, c.organization_id,
                           to_jsonb(c), jsonb_build_object('outcome', p_outcome, 'note', p_note));
end $$;
revoke all on function public.resolve_client_duplicate(uuid, text, text) from public, anon;
grant execute on function public.resolve_client_duplicate(uuid, text, text) to authenticated;

/* The flag itself is never cleared by a plain update — only by the function
   above, so the authorization check cannot be walked around by PostgREST. */
create or replace function public.guard_needs_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.needs_review and not new.needs_review
     and current_setting('bes.resolving_duplicate', true) is distinct from 'on' then
    raise exception 'Clear needs_review through resolve_client_duplicate()' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_needs_review() from public, anon, authenticated;

create trigger clients_guard_needs_review before update of needs_review on public.clients
  for each row execute function public.guard_needs_review();

/* The function sets the flag the guard looks for, inside its own transaction. */
create or replace function public.resolve_client_duplicate(
  p_client uuid,
  p_outcome text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
begin
  if p_outcome not in ('distinct_people', 'same_person_merge_requested') then
    raise exception 'Unknown outcome %', p_outcome using errcode = '22023';
  end if;
  select * into c from public.clients where id = p_client;
  if c.id is null then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;
  if not (
    (c.organization_id is not null and public.is_org_admin(c.organization_id))
    or (
      (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
        or public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'fundingops'))
      and public.is_staff_of(c.agency_id)
    )
  ) then
    raise exception 'Only an organization administrator resolves a possible duplicate' using errcode = '42501';
  end if;

  perform set_config('bes.resolving_duplicate', 'on', true);
  update public.clients
     set needs_review = false,
         review_note = case
           when p_outcome = 'same_person_merge_requested'
             then coalesce(nullif(trim(p_note), '') || ' ', '') || 'Merge requested; not yet merged.'
           else nullif(trim(p_note), '')
         end
   where id = p_client;
  perform set_config('bes.resolving_duplicate', 'off', true);

  perform public.log_audit('client.duplicate_resolved', 'client', p_client::text, c.organization_id,
                           to_jsonb(c), jsonb_build_object('outcome', p_outcome, 'note', p_note));
end $$;
revoke all on function public.resolve_client_duplicate(uuid, text, text) from public, anon;
grant execute on function public.resolve_client_duplicate(uuid, text, text) to authenticated;
