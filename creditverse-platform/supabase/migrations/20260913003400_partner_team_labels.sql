-- 0334 — the account team, in words a partner reads.
--
-- `partner_assignments.assignment_role` is a CODE — 'account_manager',
-- 'processor', 'support' — constrained to six values. 0333 returned it raw,
-- which would have put "account_manager" in front of a partner, and picked
-- between several assignments with `max()`, which is alphabetical order
-- pretending to be a judgement.
--
-- So: sentence case for the label, and when somebody holds more than one role
-- on an account, the PRIMARY assignment's role wins — that is the one the
-- partner was told about.
create or replace function public.my_partner_team()
returns table (user_id uuid, name text, role_label text, is_primary boolean)
language sql stable security definer set search_path = public as $function$
  with mine as (
    select a.user_id, a.assignment_role, a.is_primary
      from public.partner_assignments a
     where a.group_id = public.partner_group_of_user()
       and a.user_id is not null
       and a.ended_on is null
  )
  select p.id,
         coalesce(nullif(trim(p.full_name), ''), 'BES'),
         (select upper(left(replace(m2.assignment_role, '_', ' '), 1))
                 || substr(replace(m2.assignment_role, '_', ' '), 2)
            from mine m2
           where m2.user_id = p.id and m2.assignment_role is not null
           order by m2.is_primary desc, m2.assignment_role
           limit 1),
         bool_or(m.is_primary)
    from mine m
    join public.profiles p on p.id = m.user_id
   where coalesce(p.is_fixture, false) = false
   group by p.id, p.full_name
   order by bool_or(m.is_primary) desc, 2
$function$;
revoke execute on function public.my_partner_team() from public, anon;
grant execute on function public.my_partner_team() to authenticated;

comment on function public.my_partner_team() is
  'The BES people named on the caller''s own account, for the portal''s "message someone" list: a name and what they do here, never an email or a team structure. Returns nothing to anybody who is not an active partner contact.';
