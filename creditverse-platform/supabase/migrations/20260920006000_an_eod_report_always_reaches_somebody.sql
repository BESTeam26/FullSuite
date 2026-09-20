-- An End of Day report always reaches somebody.
--
-- Dee, 2026-09-20: "once EOD is submitted it's not only in the app but also
-- sent to the team lead's email and my support@blessedempireservices.com
-- email."
--
-- The lead half and the support copy were already built. What was not: a
-- report with no lead stopped dead, recorded as 'unavailable' and mailed to
-- nobody — not even to support, which was copied on every other report.
-- Eight of the current roster are on no team, so eight people's day would
-- have gone unseen the first week.
--
-- Support is now the RECIPIENT when no lead is named, rather than a copy of a
-- message that was never sent, and is not copied on a message already
-- addressed to them. The routing reason already travels in the payload, so a
-- reader can tell why it came to them.
--
-- Regenerated from the live definition — see
-- supabase/scripts/gen-eod-always-reaches-support.mjs.

CREATE OR REPLACE FUNCTION public.eod_queue_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead   record;
  v_name   text;
  v_state  text := 'pending';
  v_team   jsonb := null;
  v_leads  boolean;
  /* The address that receives every report, whether or not a lead resolved. */
  v_support constant text := 'support@blessedempireservices.com';
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;

  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  select p.id, coalesce(p.full_name, p.email) as name, p.email into v_lead
    from public.profiles p where p.id = new.routed_to;

  /* No lead resolved. The report used to stop here, recorded as
     'unavailable' and mailed to nobody — including BES, which was copied on
     every other report. Eight of the roster are on no team, so eight people's
     day would have gone unseen. It now goes to support as the recipient
     rather than the copy, and the routing reason travels in the payload so
     the reader can see it reached them because nobody else was named. */
  if v_lead.email is null then v_state := 'pending'; end if;

  /* Does this person lead anybody on a live team? Asked by SHAPE, so a future
     lead gets the section the day their designation changes and nobody has to
     remember to switch it on. */
  select exists (
    select 1 from public.team_memberships lead
     join public.teams t on t.id = lead.team_id and t.archived_at is null
     join public.team_memberships tm on tm.team_id = t.id and tm.user_id <> new.employee_id
    where lead.user_id = new.employee_id and lead.is_lead
  ) into v_leads;

  if v_leads then
    /* Totals and the people, from each report's snapshot. `null` where nobody
       reported a figure — the email renders that as "Not available", never as
       zero (Dee: "Zero means the system actually knows the value is zero"). */
    with team as (
      select distinct tm.user_id, t.name as team_name
        from public.team_memberships lead
        join public.teams t on t.id = lead.team_id and t.archived_at is null
        join public.team_memberships tm on tm.team_id = t.id and tm.user_id <> new.employee_id
       where lead.user_id = new.employee_id and lead.is_lead
    ),
    rows as (
      select coalesce(p.full_name, p.email, 'Unknown') as name,
             team.team_name,
             e.submitted_at is not null as submitted,
             (e.snapshot ->> 'production_units')::int    as production,
             (e.snapshot ->> 'actions_completed')::int   as completed,
             (e.snapshot ->> 'minutes_logged')::int      as minutes,
             jsonb_array_length(coalesce(e.snapshot -> 'blocked', '[]'::jsonb)) as blocked,
             nullif(trim(e.blockers), '')    as blockers,
             nullif(trim(e.escalations), '') as help_needed
        from team
        left join public.profiles p on p.id = team.user_id
        left join public.eod_submissions e
               on e.employee_id = team.user_id and e.work_date = new.work_date
    )
    select jsonb_build_object(
      'members',    (select count(*) from rows),
      'submitted',  (select count(*) filter (where submitted) from rows),
      'missing',    (select count(*) filter (where not submitted) from rows),
      'production', (select sum(production) from rows),
      'completed',  (select sum(completed) from rows),
      'blocked',    (select sum(blocked) from rows),
      'minutes',    (select sum(minutes) from rows),
      'people',     (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from rows r),
      /* Surfaced separately as well as inline, because Dee asked for a
         TEAM BLOCKERS / ATTENTION NEEDED section and a lead scanning on a
         phone should not have to read every line to find them. */
      'attention',  (select coalesce(jsonb_agg(jsonb_build_object(
                        'name', r.name, 'blockers', r.blockers, 'help_needed', r.help_needed)
                        order by r.name), '[]'::jsonb)
                       from rows r where r.blockers is not null or r.help_needed is not null)
    ) into v_team from rows limit 1;
  end if;

  insert into public.eod_email_outbox (
    agency_id, eod_id, kind, to_email, to_name, cc_email, subject, payload, state)
  values (
    new.agency_id, new.id, 'submitted',
    coalesce(v_lead.email, v_support),
    coalesce(v_lead.name, 'BES Support'),
    /* Copying support on a message already addressed to them is a duplicate
       in everybody's inbox. */
    case when v_lead.email is null then null else v_support end,
    v_name || ' - EOD Report - ' || to_char(new.work_date, 'FMMonth FMDD, YYYY'),
    jsonb_build_object(
      'employee_name', v_name,
      'work_date', new.work_date,
      'routing_reason', new.routing_reason,
      'snapshot', coalesce(new.snapshot, '{}'::jsonb),
      'accomplishments', new.unfinished_work,
      'blockers', new.blockers,
      'help_needed', new.escalations,
      'handoff', new.next_workday_priority,
      'notes', new.additional_notes,
      /* Null for everybody who leads nobody; the email omits the section. */
      'team', v_team),
    v_state)
  on conflict (eod_id, kind) do nothing;

  return new;
end $function$
;
