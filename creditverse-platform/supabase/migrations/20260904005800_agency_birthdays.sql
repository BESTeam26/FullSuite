-- 0080 — Birthdays across BES itself
--
-- 0073 gave every organization its team birthdays. Dee also asked for them
-- company-wide inside BES, whose people are agency staff rather than members
-- of a customer organization. Same rules: month and day only, never a year,
-- and only for people who chose to show theirs.
create or replace function public.agency_birthdays(p_within_days integer default 14)
returns table (user_id uuid, name text, avatar_path text, birth_month smallint, birth_day smallint, days_away integer)
language sql stable security definer set search_path = public as $$
  with people as (
    select p.id, coalesce(nullif(p.preferred_name, ''), p.full_name, split_part(p.email::text, '@', 1)) as name,
           p.avatar_path, p.birth_month, p.birth_day
    from public.profiles p
    join public.agency_memberships m on m.user_id = p.id
    where p.birthday_visible and p.birth_month is not null
  ), dated as (
    select id, name, avatar_path, birth_month, birth_day,
           case
             when make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28)) >= current_date
               then make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28))
             else make_date(extract(year from current_date)::int + 1, birth_month, least(birth_day, 28))
           end as next_on
    from people
  )
  select id, name, avatar_path, birth_month, birth_day, (next_on - current_date)::int
  from dated
  where public.is_agency_staff()          -- BES people only; no customer sees this
    and (next_on - current_date) <= greatest(coalesce(p_within_days, 14), 0)
  order by (next_on - current_date), name
$$;
revoke all on function public.agency_birthdays(integer) from public, anon;
grant execute on function public.agency_birthdays(integer) to authenticated;
