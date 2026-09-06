-- 0087 — Remember that the welcome email went out
--
-- The welcome email is sent once, when an organization's workspace actually
-- exists — not to be confused with the sign-up confirmation, which Supabase
-- Auth sends over SMTP to prove the address.
--
-- A stamp rather than a log: the question being asked is only "has this
-- already gone?", and the answer must survive a retry, a second sign-in and
-- two browser tabs opening at once. The Edge Function updates it with the
-- service role and only `where welcome_email_sent_at is null`, so two
-- simultaneous calls cannot both send.

alter table public.organizations
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.organizations.welcome_email_sent_at is
  'When the one-time welcome email was sent. Null means it has not been. Written only by the send-welcome function (service role).';
