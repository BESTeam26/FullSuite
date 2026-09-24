-- A shared email is not a shared person.
--
-- Dee, 2026-09-24, on finding Jenny Guzman's ClickUp card attached to
-- Estebania De La Cruz's client record: "2 Different names so why merge? -
-- DONT MERGE THEM."
--
-- `client_match_for_import` matches on the ClickUp task, then the legacy id,
-- then email, then phone digits, then name AND date of birth. It refuses to
-- merge on a name alone, which was the rule everybody worried about. Nobody
-- checked the other direction: the email and phone branches never look at the
-- name at all, so two cards carrying the same contact details become one
-- person however differently they are named.
--
-- That is how Jenny Guzman's card — which carries
-- delacruzestebania@hotmail.com and the same phone number — landed on
-- Estebania's file, taking her comments with it. In a ClickUp list that is
-- almost always a copied card, not a couple sharing an inbox.
--
-- ── THE RULE ──────────────────────────────────────────────────────────────
--
-- A strong identifier still merges, but only when the names do not
-- CONTRADICT each other. Names are compatible when either side is blank, or
-- when they share a word — "Jane Smith" and "Jane Marie Smith" are the same
-- person, "Jenny Guzman" and "Estebania De La Cruz" are not.
--
-- Deliberately a shared WORD rather than an exact match, because the whole
-- point of matching on email is to survive a card that writes the name
-- differently. And deliberately not a similarity score: a threshold is a
-- number somebody has to defend later, and "they have no name in common" is
-- a fact.
--
-- Where the names contradict, nothing merges and a second client is created —
-- which is the honest outcome. Two records for one person is a five-minute
-- fix; two people in one record loses somebody's history.
--
-- Cost impact: no material increase.

begin;

/**
 * Do these two names contradict each other?
 *
 * Blank on either side is not a contradiction — an imported card often has a
 * name in the title and nothing in the body.
 */
create or replace function public.names_are_compatible(a text, b text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when a is null or b is null or btrim(a) = '' or btrim(b) = '' then true
    else exists (
      select 1
        from unnest(string_to_array(lower(regexp_replace(a, '[^a-zA-Z ]', ' ', 'g')), ' ')) x
        join unnest(string_to_array(lower(regexp_replace(b, '[^a-zA-Z ]', ' ', 'g')), ' ')) y
          on x = y
       where length(x) > 1
    )
  end
$function$;

comment on function public.names_are_compatible(text, text) is
  'False only when two names share no word at all. Used to stop a shared '
  'email or phone merging two different people (Dee, 2026-09-24).';

do $$
declare
  v_def text := pg_get_functiondef(
    'public.client_match_for_import(uuid,text,text,text,text,text,text,date)'::regprocedure);
  v_new text;
  v_hits int;
begin
  /* Both the email and the phone lookups join `clients` already, so the name
     is in reach without another table. */
  v_new := replace(v_def,
    'where fc.outsourcing_group_id = p_group and lower(c.email::text) = lower(btrim(p_email));',
    E'where fc.outsourcing_group_id = p_group and lower(c.email::text) = lower(btrim(p_email))\n'
    '       /* …and the names do not contradict each other. */\n'
    '       and public.names_are_compatible(c.full_name, p_full_name);');

  v_new := replace(v_new,
    E'       and regexp_replace(coalesce(c.phone, \'\'), \'\\D\', \'\', \'g\')\n'
    '           = regexp_replace(p_phone, \'\\D\', \'\', \'g\');',
    E'       and regexp_replace(coalesce(c.phone, \'\'), \'\\D\', \'\', \'g\')\n'
    '           = regexp_replace(p_phone, \'\\D\', \'\', \'g\')\n'
    '       and public.names_are_compatible(c.full_name, p_full_name);');

  v_hits := (length(v_new) - length(replace(v_new, 'names_are_compatible', ''))) / length('names_are_compatible');
  if v_hits <> 2 then
    raise exception 'expected to guard 2 lookups, guarded % — read the function before replacing it', v_hits;
  end if;
  execute v_new;
end $$;

/* The rule, asked of the two names that caused it. */
do $$
begin
  if public.names_are_compatible('Jenny Guzman', 'Estebania De La Cruz') then
    raise exception 'the guard does not separate the two names it was written for';
  end if;
  if not public.names_are_compatible('Jane Smith', 'Jane Marie Smith') then
    raise exception 'the guard separates one person written two ways';
  end if;
  if not public.names_are_compatible(null, 'Jane Smith') then
    raise exception 'a blank name is being treated as a contradiction';
  end if;
end $$;

commit;
