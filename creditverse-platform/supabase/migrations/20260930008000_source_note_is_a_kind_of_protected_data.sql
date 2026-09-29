-- `source_note` is a kind of protected data.
--
-- 20260930004000 made the preserved ClickUp description a `client_secrets`
-- row of kind `source_note`, so it inherits the SSN's masking, audited
-- reveal and capability. The writer accepted the kind; the table did not:
-- `client_secrets_kind_check` still lists the original four, and the first
-- backfill batch failed on it — 50 of 50, loudly, nothing stored.
--
-- The constraint is the right place for the vocabulary, so it grows here
-- rather than being dropped. Everything else about the row is unchanged:
-- same policies, same reveal path, same events.
--
-- Cost impact: none.

begin;

alter table public.client_secrets drop constraint if exists client_secrets_kind_check;
alter table public.client_secrets
  add constraint client_secrets_kind_check
  check (kind in ('ssn', 'monitoring', 'cfpb', 'other', 'source_note'));

commit;
