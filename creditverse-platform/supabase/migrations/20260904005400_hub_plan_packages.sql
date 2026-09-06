-- 0076 — Hub packages on the Empire plans
--
-- 0075 mapped the older bundles and missed the Empire plans, which are the
-- ones being sold. Dee's mapping (CLAUDE.md rule 18):
--   Empire Build      → Hub Core
--   Empire Grow       → Hub Core + Operations
--   Empire Scale      → Hub Core + Operations + Performance
--   Empire Enterprise → all of the above
-- Hub AI stays off every plan: it is entitlement-granted separately because
-- its usage is metered as credits.
update public.plans set products = products || array['hubCore']::public.product_key[]
 where key = 'empire_build' and not ('hubCore' = any (products));

update public.plans set products = products || array['hubCore','hubOperations']::public.product_key[]
 where key = 'empire_grow' and not ('hubCore' = any (products));

update public.plans set products = products || array['hubCore','hubOperations','hubPerformance']::public.product_key[]
 where key in ('empire_scale', 'empire_enterprise') and not ('hubCore' = any (products));
