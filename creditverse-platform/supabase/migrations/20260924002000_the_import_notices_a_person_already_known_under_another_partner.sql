-- The import notices a person already known under another partner.
--
-- Dee locked D-023 on 2026-09-24: duplicate detection stays inside one
-- partner, the same human under a second partner gets a separate file there,
-- and neither partner sees the other's. BES alone may know the two look
-- connected.
--
-- `clickup_import_client` is edited in place — read back, one call inserted at
-- the point where the client row is settled, and refused if the text it
-- expects is not there. The count travels back in the result so the import
-- summary can say something was noticed, without saying who or where.
--
-- Cost impact: no material increase. One extra bounded query per imported
-- card, on indexed columns.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
  v_anchor text := '  perform public.import_link_record(''clickup'', ''task'', p->>''task_id'', ''fulfillment_client'', v_fc::text, null);';
  v_add text;
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'clickup_import_client does not contain the expected anchor — read it before replacing it';
  end if;

  v_add := v_anchor || E'\n\n' ||
'  /* Dee, 2026-09-24 (D-023): a person who turns up under a second partner
     gets a SEPARATE file there, and the partners never see each other''s.
     BES may know the two look like one person, so the fact is recorded — as
     a note, in a table no partner-facing query reads. Never a merge, never
     a widening, and never by decrypting an SSN. */
  v_cross := public.client_note_cross_partner_identity(v_client, v_group);';

  v_new := replace(v_def, v_anchor, v_add);

  /* One more declaration, and the count goes back in the result so the import
     summary can say that something was noticed without saying what. */
  v_new := replace(v_new,
    '  v_may_secret boolean;',
    E'  v_may_secret boolean;\n  v_cross int := 0;');
  v_new := replace(v_new,
    '''secrets_skipped'', (not v_may_secret));',
    '''secrets_skipped'', (not v_may_secret), ''cross_partner_notes'', v_cross);');

  if v_new = v_def then
    raise exception 'nothing was replaced';
  end if;
  execute v_new;
end $$;

do $$
declare v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
begin
  if position('client_note_cross_partner_identity' in v_def) = 0
     or position('cross_partner_notes' in v_def) = 0 then
    raise exception 'the cross-partner note did not land';
  end if;
end $$;

commit;
