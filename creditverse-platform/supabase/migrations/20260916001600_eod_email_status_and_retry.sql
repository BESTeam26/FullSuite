-- "EOD submitted · Email delivery failed", and a way to try again.
--
-- Dee, 2026-09-16: *"Email failure must NOT undo a valid EOD submission.
-- Instead show: EOD submitted · Email delivery failed and allow authorized
-- retry."*
--
-- The first half was built with the outbox. This is the second: a read that
-- tells somebody what happened to their email, and a retry that is a
-- permission rather than a button.
--
-- ── WHY THE READ IS A FUNCTION AND NOT A SELECT ────────────────────────────
--
-- The outbox row carries the recipient's address and the whole report payload.
-- The author needs to know whether their email went; they do not need their
-- lead's address handed back to them by an API call. So the function returns
-- the STATUS and nothing that was not already theirs.

create or replace function public.my_eod_email_status(p_eod uuid)
returns table (
  state         text,
  attempts      integer,
  sent_at       timestamptz,
  last_error    text,
  recipient     text,
  may_retry     boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.state, o.attempts, o.sent_at,
         /* The provider's words are shown to somebody who can act on them, and
            withheld from somebody who cannot — an author seeing "550 mailbox
            unavailable" learns only that something is wrong. */
         case when public.agency_can('ops.manage') then o.last_error end,
         /* The lead's NAME, never their address. */
         o.to_name,
         /* Retry is for a failure, not for a success and not for a report that
            has nobody to send to. Five attempts is where the sweep stops. */
         (o.state = 'failed' and o.attempts < 5
          and (public.agency_can('ops.manage') or e.employee_id = auth.uid()))
    from public.eod_email_outbox o
    join public.eod_submissions e on e.id = o.eod_id
   where o.eod_id = p_eod
     and public.is_agency_staff()
     and (e.employee_id = auth.uid()
          or e.routed_to = auth.uid()
          or public.agency_can('ops.manage'))
   limit 1
$$;

comment on function public.my_eod_email_status(uuid) is
  'What happened to the email for one report. Returns the lead''s name, never their address, and the provider''s error only to somebody who can act on it.';

grant execute on function public.my_eod_email_status(uuid) to authenticated;

-- ── Retry ──────────────────────────────────────────────────────────────────

create or replace function public.retry_eod_email(p_eod uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ok boolean;
begin
  /* The author of the report, or management. Checked here rather than trusted
     from the caller — this queues an email in BES's name. */
  select (e.employee_id = auth.uid() or public.agency_can('ops.manage'))
    into v_ok
    from public.eod_submissions e where e.id = p_eod;

  if not coalesce(v_ok, false) or not public.is_agency_staff() then
    raise exception 'Not yours to retry' using errcode = '42501';
  end if;

  /* Only a FAILED row, and the attempt counter is deliberately NOT reset: five
     tries is five tries however they are spread out, or a retry button becomes
     an unbounded way to hammer the provider. Setting it back to pending is
     enough for the sweep to pick it up again. */
  update public.eod_email_outbox
     set state = 'pending', last_error = null, updated_at = now()
   where eod_id = p_eod and state = 'failed' and attempts < 5;

  return found;
end $$;

comment on function public.retry_eod_email(uuid) is
  'Puts a failed EOD email back in the queue. The attempt count is not reset — five tries stays five tries, however they are spread out.';

grant execute on function public.retry_eod_email(uuid) to authenticated;
