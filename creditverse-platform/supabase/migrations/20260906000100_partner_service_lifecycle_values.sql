-- 0158 — a service line has more shapes than a subscription.
--
-- The real partner tracker contains one-time builds ("Full Build - GHL",
-- "Partial Build") and rows sitting at "Pending Payment" / "Build for follow
-- up". Those are genuine commercial lines, and forcing them into
-- onboarding/active/paused/ended either lies about them or loses them.
--
-- Alone in its own migration because `alter type ... add value` and any
-- statement that USES the new value cannot share a transaction. 0159 uses
-- them; this file only creates them.
alter type public.partner_service_status add value if not exists 'pending';
alter type public.partner_service_status add value if not exists 'completed';
alter type public.partner_service_status add value if not exists 'cancelled';
