-- 0123 — remove a security check that cannot fail.
--
-- 0122 converted `begin_letter_mailing` to SECURITY DEFINER and added what
-- looked like a replacement for the visibility the INVOKER select used to
-- provide:
--
--     if not public.credit_client_visible(l.client_id) then …
--
-- That call is a no-op. `credit_client_visible` is itself SECURITY INVOKER and
-- works by letting RLS filter `fulfillment_clients` — so when it is called
-- from inside a DEFINER function it runs with the definer's privileges, RLS is
-- bypassed, and it returns true for every client that exists.
--
-- A security check that cannot fail is worse than no check: it reads as
-- protection and is not. It is removed rather than repaired because the real
-- protection is already there and is genuinely sufficient —
-- `credit_client_writable` is SECURITY DEFINER and computes authorization from
-- `auth.uid()`: BES staff need a live creditops engagement AND team scope, and
-- an organization user needs membership of the owning organization with the
-- product entitled. Neither depends on RLS filtering a row, so both still
-- answer for the CALLER under DEFINER.
--
-- The lesson generalises, which is why it is written here rather than in a
-- commit message: an INVOKER predicate is not a security check inside a
-- DEFINER function. Only a predicate that reads `auth.uid()` and computes an
-- answer survives the change of context.

create or replace function public.begin_letter_mailing(
  p_letter    uuid,
  p_to        jsonb,
  p_from      jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  l public.dispute_letters%rowtype;
  v_org uuid;
  v_id uuid;
  v_missing text;
begin
  select * into l from public.dispute_letters where id = p_letter;
  if l.id is null then raise exception 'Letter not found' using errcode = 'P0002'; end if;
  /*
   * The whole authorization, in one predicate. `credit_client_writable` is
   * DEFINER and computes from auth.uid(); it is not an RLS-filtered read, so
   * it still answers for the caller here. Anyone it refuses cannot see the
   * letter either — the same engagement, scope and membership decide both.
   */
  if not public.credit_client_writable(l.client_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  select fc.organization_id into v_org from public.fulfillment_clients fc where fc.id = l.client_id;
  perform public.require_permission(v_org, 'creditops.letters.build');

  if l.status not in ('approved', 'printed') then
    raise exception 'Only an approved letter can be posted' using errcode = '22023';
  end if;

  v_missing := coalesce(
    nullif(concat_ws(', ',
      case when coalesce(trim(p_to->>'name'),  '') = '' then 'recipient name' end,
      case when coalesce(trim(p_to->>'line1'), '') = '' then 'recipient street' end,
      case when coalesce(trim(p_to->>'city'),  '') = '' then 'recipient city' end,
      case when coalesce(trim(p_to->>'state'), '') = '' then 'recipient state' end,
      case when coalesce(trim(p_to->>'zip'),   '') = '' then 'recipient ZIP' end,
      case when coalesce(trim(p_from->>'name'),  '') = '' then 'sender name' end,
      case when coalesce(trim(p_from->>'line1'), '') = '' then 'sender street' end,
      case when coalesce(trim(p_from->>'city'),  '') = '' then 'sender city' end,
      case when coalesce(trim(p_from->>'state'), '') = '' then 'sender state' end,
      case when coalesce(trim(p_from->>'zip'),   '') = '' then 'sender ZIP' end
    ), ''), null);
  if v_missing is not null then
    raise exception 'Cannot post: missing %', v_missing using errcode = '22023';
  end if;

  insert into public.letter_mailings (
    letter_id, to_name, to_line1, to_line2, to_city, to_state, to_zip,
    from_name, from_line1, from_line2, from_city, from_state, from_zip, requested_by
  ) values (
    p_letter,
    trim(p_to->>'name'), trim(p_to->>'line1'), nullif(trim(coalesce(p_to->>'line2','')), ''),
    trim(p_to->>'city'), upper(trim(p_to->>'state')), trim(p_to->>'zip'),
    trim(p_from->>'name'), trim(p_from->>'line1'), nullif(trim(coalesce(p_from->>'line2','')), ''),
    trim(p_from->>'city'), upper(trim(p_from->>'state')), trim(p_from->>'zip'),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.begin_letter_mailing(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.begin_letter_mailing(uuid, jsonb, jsonb) to authenticated;
