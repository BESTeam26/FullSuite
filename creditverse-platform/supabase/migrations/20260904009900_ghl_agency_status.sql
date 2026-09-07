-- 0121 — "is the agency connected?", answerable without reading the token.
--
-- `ghl_agency_credentials` has no grants at all, which is correct and is the
-- point: no browser role can select from it, so no browser can read the token.
-- But that also means nothing could answer the ordinary question "are we
-- connected, and to which company?" — the interface was inferring it from
-- whether any location had been synced, which is only true AFTER a sync and
-- says nothing after a disconnect.
--
-- So: a function that returns the facts about the credential and never the
-- credential. SECURITY DEFINER because it must read a table the caller cannot,
-- and gated on `is_agency_staff()` as the first thing it does.
create or replace function public.ghl_agency_status()
returns table (
  connected boolean,
  company_id text,
  token_kind text,
  has_webhook_secret boolean,
  expires_at timestamptz,
  rotated_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    true,
    c.company_id,
    c.token_kind,
    c.webhook_secret is not null,
    c.expires_at,
    c.rotated_at
  from public.ghl_agency_credentials c
  where public.is_agency_staff()
$$;
revoke all on function public.ghl_agency_status() from public, anon;
grant execute on function public.ghl_agency_status() to authenticated;

comment on function public.ghl_agency_status() is
  'Facts ABOUT the GHL agency credential. Never the token itself — that table has no grants and this function does not select it.';
