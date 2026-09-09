-- =============================================================================
-- Repair of 0285: signature_request_preview declared an OUT column named
-- `status`, and plpgsql then read the bare `status` inside its UPDATE as that
-- variable rather than the table column — "column reference is ambiguous", on
-- the one function a signer's link calls first. Every reference is qualified.
-- Caught by the send → view → sign probe, not by the deploy.
-- =============================================================================
create or replace function public.signature_request_preview(p_token uuid)
returns table (title text, signer_name text, signer_email text, rendered_html text, signed_html text,
               status text, expires_at timestamptz, signed_at timestamptz, agency_name text, agency_branding jsonb)
language plpgsql security definer set search_path = public as $function$
begin
  update public.signature_requests r
     set status = 'viewed', viewed_at = now()
   where r.token = p_token and r.status = 'sent' and r.expires_at > now();

  return query
    select r.title, r.signer_name, r.signer_email::text, r.rendered_html, r.signed_html,
           case when r.status in ('sent', 'viewed') and r.expires_at <= now() then 'expired' else r.status end,
           r.expires_at, r.signed_at, a.name, a.branding
      from public.signature_requests r
      join public.agencies a on a.id = r.agency_id
     where r.token = p_token and r.status <> 'voided';
end $function$;
