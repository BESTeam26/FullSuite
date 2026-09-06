-- 0108 — SECURITY FIX. credit_report_visible() must be SECURITY INVOKER.
--
-- Introduced by me in 0102 and caught by the authorization matrix, phase 16.
-- This is the 0066 mistake in its purest form: I restated a live function from
-- memory to add one branch, and silently changed its security context.
--
-- The live definition was:
--
--   CREATE OR REPLACE FUNCTION public.credit_report_visible(...)
--    RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
--
-- No SECURITY DEFINER. That mattered enormously, because the function's first
-- branch is:
--
--   when p_client is not null then entity_visible('fulfillment_client', p_client)
--
-- and `entity_visible` works by asking "does a row with this id exist?" — a
-- question whose answer depends entirely on the CALLER'S row-level security.
-- Run as the caller, it means "can you see this client". Run as the definer,
-- it means "does this client exist", which is true for every client in the
-- database.
--
-- WHAT THAT BROKE. `credit_reports` uses this function in both its select and
-- its insert policies. So from 0102 until now, any organization's owner could
-- read AND CREATE credit reports against any other organization's client.
-- Reproduced before fixing: org2's owner successfully imported a report for a
-- Lakeside client.
--
-- Restored to invoker. The branch 0102 needed is in the POLICY, not in here,
-- and `client_visible()` is legitimately definer because it does its own
-- explicit membership checks rather than leaning on the caller's view.
--
-- The lesson, again: a function's security context is part of its meaning. Diff
-- pg_get_functiondef before rewriting, every time — I diffed it for
-- assign_client_public_id in 0093 and caught a problem, and did not diff it
-- here.

create or replace function public.credit_report_visible(p_client uuid, p_consumer uuid, p_org uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_client is not null then public.entity_visible('fulfillment_client', p_client::text)
    when p_consumer is not null then
      p_consumer = auth.uid()
      or (public.is_org_member(p_org) and public.org_entitled(p_org, 'diyCredit'))
      or (public.bes_engaged_with(p_org))
    else false
  end
$$;
