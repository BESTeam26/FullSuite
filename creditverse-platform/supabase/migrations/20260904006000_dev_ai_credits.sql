-- 0082 — A credit balance for the test organizations
--
-- Reading a scanned report, letter wording help and "explain this fit" all
-- stop at `ai_can_use()`, which needs a positive balance. Without one, the
-- only thing testable is the refusal. Two test organizations get a starting
-- balance so the whole path can be exercised the moment the provider key is
-- set. Test organizations only.
insert into public.ai_credit_ledger (organization_id, delta_credits, kind, reference)
select o.id, 500, 'adjustment', 'dev fixture: starting balance for testing'
  from public.organizations o
 where o.name in ('[TEST] Lakeside Partners', '[TEST] Cedar Financial')
   and not exists (
     select 1 from public.ai_credit_ledger l
      where l.organization_id = o.id and l.reference = 'dev fixture: starting balance for testing'
   );
