-- Who covers the work while somebody is away.
--
-- Dee's mockup, 2026-09-18: the Request Time Off form has a "Coverage /
-- Handoff (optional)" box — "All ongoing client tasks are updated. JM will
-- cover urgent items." — and the manager's review shows it back beside the
-- dates. It is the field that decides most approvals: a lead is not really
-- asking "may they have the days", they are asking "what happens to the work".
--
-- `reason` cannot carry it. Reason is WHY somebody is away and is often
-- personal; coverage is an operational arrangement the team acts on. Folding
-- two different things into one box means a manager reading for one has to
-- read past the other, and it makes the reason harder to keep private later.

alter table public.leave_requests
  add column if not exists coverage_note text;

comment on column public.leave_requests.coverage_note is
  'How the work is covered while this person is away — deliberately separate from `reason`, which is why they are away and is often personal.';
