-- An imported comment never says "undefined".
--
-- Dee, 2026-09-30: "ensure the imported text never renders: undefined null
-- [object Object]". Auditing the copy: 552 imported comment events on 368
-- clients carry a line that is literally "undefined". ClickUp's
-- `comment_text` is its own concatenation of a comment's parts, and an
-- attachment part has no text — so an image-only comment arrives as the
-- string "undefined\n", and an image inside a sentence as "…\nundefined\n…".
-- The importer stored that string faithfully.
--
-- The Edge Function now builds a comment's text from its structured parts
-- (an attachment becomes "[attachment: <name>]"), for new imports and for
-- the repair of the 552. `clickup_repair_comment_text` is the one writer
-- for the repair: it finds the event by the client the task maps to and the
-- comment's own timestamp — the key the importer wrote it under — and
-- replaces the detail only when it still carries an artifact. Service role
-- only; nothing in the browser rewrites history.
--
-- `activity_events` is append-only for its readers. This is not a reader
-- rewriting history: it is the importer correcting its own parser artifact,
-- and the repair is idempotent — a repaired row no longer matches.
--
-- Cost impact: none.

begin;

create or replace function public.clickup_repair_comment_text(
  p_task_id text, p_comment_id text, p_at timestamptz, p_text text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fc   text;
  v_n    int;
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_text = '' or v_text ~* '(^|\n)(undefined|null|\[object object\])(\n|$)' then
    return jsonb_build_object('repaired', 0, 'reason', 'replacement text is empty or still an artifact');
  end if;
  select il.entity_id into v_fc
    from public.import_links il
   where il.source_system = 'clickup' and il.source_kind = 'task' and il.source_id = p_task_id
   limit 1;
  if v_fc is null then
    return jsonb_build_object('repaired', 0, 'reason', 'task not in crosswalk');
  end if;
  if not exists (select 1 from public.import_links il
                  where il.source_system = 'clickup' and il.source_kind = 'comment'
                    and il.source_id = p_comment_id and il.entity_id = v_fc) then
    return jsonb_build_object('repaired', 0, 'reason', 'comment not imported for this client');
  end if;
  update public.activity_events a
     set detail = v_text
   where a.entity_type = 'fulfillment_client' and a.entity_id = v_fc
     and a.action = 'Imported from ClickUp'
     and a.created_at = p_at
     and a.detail ~* '(^|\n)(undefined|null|\[object object\])(\n|$)';
  get diagnostics v_n = row_count;
  return jsonb_build_object('repaired', v_n);
end $$;

revoke all on function public.clickup_repair_comment_text(text, text, timestamptz, text) from public;
revoke all on function public.clickup_repair_comment_text(text, text, timestamptz, text) from authenticated;
grant execute on function public.clickup_repair_comment_text(text, text, timestamptz, text) to service_role;

commit;
