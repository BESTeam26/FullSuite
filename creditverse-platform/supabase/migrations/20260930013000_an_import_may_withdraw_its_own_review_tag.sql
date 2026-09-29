-- An import may withdraw its own review tag.
--
-- `guard_needs_review` lets `needs_review` be cleared only by
-- `resolve_client_duplicate()`, which is right for a duplicate: a person
-- decides. A tag the IMPORT wrote — "[credential conflict]", set 92 times
-- by a detector that counted any two passwords on a card — is not a
-- person's decision, and withdrawing it is not resolving a duplicate.
--
-- This is the one narrow way through: it removes exactly one tagged line
-- from every note carrying it, and clears `needs_review` only where nothing
-- else remains in the note. Any other tag — "[round conflict]", "[round
-- unknown]", a duplicate note — keeps the client flagged. Service role
-- only: it exists for the import tooling, not for a screen.
--
-- Cost impact: none.

begin;

create or replace function public.clickup_withdraw_review_tag(p_tag text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  if p_tag is null or p_tag !~ '^\[[a-z ]+\]$' then
    raise exception 'a review tag looks like "[credential conflict]"' using errcode = '22023';
  end if;
  perform set_config('bes.resolving_duplicate', 'on', true);
  with cleared as (
    update public.clients c
       set review_note = nullif(btrim(regexp_replace(c.review_note,
                           '(^|\n)' || regexp_replace(p_tag, '([\[\]])', '\\\1', 'g') || '[^\n]*', '', 'g')), ''),
           needs_review = c.needs_review
                          and nullif(btrim(regexp_replace(c.review_note,
                           '(^|\n)' || regexp_replace(p_tag, '([\[\]])', '\\\1', 'g') || '[^\n]*', '', 'g')), '') is not null
     where c.review_note like '%' || p_tag || '%'
     returning 1)
  select count(*) into v_n from cleared;
  perform set_config('bes.resolving_duplicate', 'off', true);
  return v_n;
end $$;

revoke all on function public.clickup_withdraw_review_tag(text) from public;
revoke all on function public.clickup_withdraw_review_tag(text) from authenticated;
grant execute on function public.clickup_withdraw_review_tag(text) to service_role;

/* Proof, rolled back: a note with two tags loses one and stays flagged. */
do $$
declare v_id uuid; v_note text; v_flag boolean;
begin
  select id into v_id from public.clients where review_note like '%[round unknown]%' limit 1;
  if v_id is null then return; end if;
  update public.clients set review_note = review_note || E'\n[credential conflict] test line' where id = v_id;
  perform public.clickup_withdraw_review_tag('[credential conflict]');
  select review_note, needs_review into v_note, v_flag from public.clients where id = v_id;
  if v_note like '%[credential conflict]%' or not v_flag or v_note not like '%[round unknown]%' then
    raise exception 'withdraw: expected the conflict line gone and the round tag kept (%, %)', v_flag, v_note;
  end if;
  raise notice 'withdraw proof passed';
end $$;

commit;
