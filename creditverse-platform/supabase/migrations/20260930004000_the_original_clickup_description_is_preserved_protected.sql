-- The original ClickUp description is preserved — as protected data.
--
-- Dee, 2026-09-30: "EVERYTHING from the original ClickUp task description
-- must be preserved in Notes… I do not want information silently discarded
-- simply because FullSuite already extracted it into a structured field…
-- However, do this securely. The source Note may contain SSNs and passwords,
-- so it must NOT become an unrestricted ordinary note… Structured canonical
-- fields/Vault remain the operational source; the ClickUp description Note
-- is the preserved historical source/provenance."
--
-- ── WHERE IT LIVES, AND WHY NOT A NOTES TABLE ────────────────────────────
--
-- There is no notes table, and there should not be one for this. The
-- protected-data machinery already exists: `client_secrets` holds a vault
-- reference, `client_secret_reveal` is the ONLY read path and records every
-- reveal in `client_secret_events`, and both are gated on
-- `creditops.clients.sensitive`. A preserved description goes there as kind
-- `source_note`, so it inherits masking, the audited reveal, and the
-- capability — the same rules an SSN already obeys — with no second
-- permission system (rules 1, 5, 13).
--
-- Both description columns on `fulfillment_clients` were EMPTY for all
-- 2,143 clients: nothing of the original text had been kept anywhere. This
-- is a full backfill, not a top-up.
--
-- ── ONE WRITER ───────────────────────────────────────────────────────────
--
-- `clickup_preserve_description` is the single function that stores a
-- preserved description. The Edge Function calls it for every card it
-- imports from now on AND for the backfill of every card already imported.
-- Two call sites, one writer; no duplicate logic (rule 6).
--
-- Idempotent by (client, kind, task): a rerun updates the one existing row
-- rather than adding another. Provenance travels on the row — the task id in
-- `url`, the import time and source in `notes`.
--
-- ── WHAT IS REFUSED ──────────────────────────────────────────────────────
--
--   · text that is empty, or is a parser artifact ("undefined", "null",
--     "[object Object]") — nothing is stored, nothing is claimed
--   · a task the crosswalk does not know — the client is resolved through
--     `import_links`, never from a caller-supplied client id
--
-- ── CREDENTIAL CONFLICTS ─────────────────────────────────────────────────
--
-- Where the caller found two different values for the same credential in
-- one description (Kendra Smith's two SmartCredit passwords, Fernando
-- Serrato's two IdentityIQ passwords), nothing is chosen. Both stay in the
-- preserved text, and the canonical client is flagged `needs_review` with a
-- note — the flag the Client Directory already counts and filters on.
--
-- Cost impact: one vault row per imported client (~2,100), written once.

begin;

create or replace function public.clickup_preserve_description(
  p_task_id     text,
  p_text        text,
  p_imported_at timestamptz default null,
  p_conflict    text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fc       public.fulfillment_clients%rowtype;
  v_client   uuid;
  v_existing uuid;
  v_text     text := btrim(coalesce(p_text, ''));
  v_notes    text;
  v_id       uuid;
  v_action   text;
  v_imported timestamptz;
begin
  /* Parser artifacts are not content. */
  if v_text = '' or lower(v_text) in ('undefined', 'null', '[object object]', 'none') then
    return jsonb_build_object('stored', false, 'reason', 'empty');
  end if;
  v_text := regexp_replace(v_text, '(\[object Object\]|\bundefined\b)', '', 'g');
  v_text := btrim(v_text);
  if v_text = '' then
    return jsonb_build_object('stored', false, 'reason', 'artifacts only');
  end if;

  /* The client comes from the crosswalk, never from the caller. */
  select fc.* into v_fc
    from public.import_links il
    join public.fulfillment_clients fc on fc.id::text = il.entity_id
   where il.source_system = 'clickup' and il.source_kind = 'task' and il.source_id = p_task_id
   limit 1;
  if v_fc.id is null then
    return jsonb_build_object('stored', false, 'reason', 'task not in crosswalk');
  end if;
  /* Provenance from the crosswalk itself when the caller has none. */
  select il.imported_at into v_imported from public.import_links il
   where il.source_system = 'clickup' and il.source_kind = 'task' and il.source_id = p_task_id
   limit 1;
  v_imported := coalesce(p_imported_at, v_imported);
  v_client := v_fc.client_id;
  if v_client is null then
    return jsonb_build_object('stored', false, 'reason', 'work file has no canonical client');
  end if;

  v_notes := 'Preserved from ClickUp task ' || p_task_id
          || case when v_imported is not null
                  then ', imported ' || to_char(v_imported at time zone 'America/New_York', 'YYYY-MM-DD')
                  else '' end
          || '. Historical source, not the operational record: identity and logins live in their own fields.';

  select cs.id into v_existing
    from public.client_secrets cs
   where cs.client_id = v_client and cs.kind = 'source_note'
     and cs.url = 'clickup:task:' || p_task_id and cs.archived_at is null;

  /* Through the one audited writer, so kind, vault naming and events are the
     same as for every other protected value. */
  v_id := public.client_secret_write(
    v_client, 'source_note', v_text,
    'ClickUp description',            -- label
    'ClickUp',                        -- provider
    null,                             -- username
    'clickup:task:' || p_task_id,     -- url: the provenance key
    v_notes,
    v_existing);
  v_action := case when v_existing is null then 'created' else 'updated' end;

  if nullif(btrim(coalesce(p_conflict, '')), '') is not null then
    update public.clients c
       set needs_review = true,
           review_note = case
             when coalesce(c.review_note, '') like '%[credential conflict]%' then c.review_note
             else concat_ws(E'\n', nullif(c.review_note, ''),
                    '[credential conflict] ' || p_conflict || ' — both values are in the preserved ClickUp description; nothing was chosen.')
           end
     where c.id = v_client;
  end if;

  return jsonb_build_object('stored', true, 'action', v_action, 'secret_id', v_id,
                            'client_id', v_client, 'chars', length(v_text));
end $$;

comment on function public.clickup_preserve_description(text, text, timestamptz, text) is
  'The one writer for preserved ClickUp descriptions: a protected source_note '
  'on client_secrets, idempotent per task, provenance on the row. Called by the '
  'importer for new cards and by the backfill for cards already imported.';

/* Service role only: the Edge Function is the sole caller. Nothing in the
   browser may store a description as protected data on somebody's behalf. */
revoke all on function public.clickup_preserve_description(text, text, timestamptz, text) from public;
revoke all on function public.clickup_preserve_description(text, text, timestamptz, text) from authenticated;
grant execute on function public.clickup_preserve_description(text, text, timestamptz, text) to service_role;

/* And the reveal path stays the only read path: `source_note` rows are
   selected and revealed under the same policies as every other kind. The
   check here is that no separate, weaker path was left open. */
do $$
begin
  if exists (
    select 1 from pg_policy p
     where p.polrelid = 'public.client_secrets'::regclass
       and pg_get_expr(p.polqual, p.polrelid) ilike '%source_note%'
  ) then
    raise exception 'a client_secrets policy names source_note — it must be treated like every other kind';
  end if;
end $$;

commit;
