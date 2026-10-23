-- The ClickUp sync secret has one home: the Vault.
--
-- The dispatcher (clickup_sync_dispatch) reads the shared secret from the
-- Vault and sends it; the importer must compare it against the same value.
-- Rather than a second copy in the function's environment, the importer
-- asks the database — with the service key, which only it holds — through
-- this one function. Nobody signed in can call it.
--
-- Cost impact: none.

begin;

create or replace function public.clickup_sync_secret()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'clickup_sync_secret'
$$;
revoke all on function public.clickup_sync_secret() from public, anon, authenticated;
grant execute on function public.clickup_sync_secret() to service_role;

commit;
