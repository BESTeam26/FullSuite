-- `notifications.visibility` is NOT NULL and has no default, and the EOD
-- trigger omitted it — so every submission failed with 23502 the moment the
-- notification fired. Caught by running it, not by reading it.
--
-- `bes_internal` is the only correct value and worth stating rather than
-- defaulting: an end-of-day report is BES's own operating record. It names
-- internal blockers, internal escalations and what somebody could not finish.
-- None of that is a partner's to read, and `shared_with_partner` on this row
-- would be a leak wearing a sensible-looking enum value.

create or replace function public.eod_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name   text;
  v_urgent boolean;
  v_detail text;
begin
  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null) then

    /* Dee: "Blockers/help-needed submissions should be visually prioritized."
       Decided here, from what the person actually wrote, and carried in the
       text so a list can sort on it without re-reading every report. */
    v_urgent := coalesce(nullif(trim(new.blockers), ''), nullif(trim(new.escalations), '')) is not null;
    v_detail := to_char(new.work_date, 'FMMon FMDD')
                || case when v_urgent then ' · blockers or help needed' else '' end;

    if new.routed_to is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, kind, entity_type, entity_id, entity_label,
         title, detail, visibility)
      values (new.routed_to, new.employee_id, new.agency_id, 'eod', 'eod_submission',
              new.id::text, 'Team EOD',
              v_name || ' submitted their EOD report', v_detail, 'bes_internal');
    end if;

    insert into public.notifications
      (recipient_id, agency_id, kind, entity_type, entity_id, entity_label,
       title, detail, visibility)
    values (new.employee_id, new.agency_id, 'eod', 'eod_submission',
            new.id::text, 'End of Day',
            'Your EOD report was submitted successfully',
            case when new.routed_to is not null
                 then v_detail || ' · sent to your team lead'
                 /* Honest rather than reassuring: no lead resolved means nobody
                    has been told, and the person should know that. */
                 else v_detail || ' · no team lead is set, so nobody was notified' end,
            'bes_internal');
  end if;

  if tg_op = 'UPDATE'
     and new.reviewed_at is not null and old.reviewed_at is null
     and new.reviewed_by is distinct from new.employee_id then
    insert into public.notifications
      (recipient_id, actor_id, agency_id, kind, entity_type, entity_id, entity_label,
       title, detail, visibility)
    values (new.employee_id, new.reviewed_by, new.agency_id, 'eod', 'eod_submission',
            new.id::text, 'End of Day',
            case when new.state = 'needs_clarification'
                 then 'Your team lead asked about your EOD report'
                 else 'Your EOD was reviewed by your team lead' end,
            to_char(new.work_date, 'FMMon FMDD')
              || case when nullif(trim(new.review_note), '') is not null
                      then ' · ' || left(new.review_note, 120) else '' end,
            'bes_internal');
  end if;

  return new;
end $$;
