-- Jenny Guzman's comments and files come home from Estebania De La Cruz's record.
--
-- Final inventory, 2026-09-30: Jenny Guzman (Approve with Tiff, ClickUp card
-- 86eykmp6g) shows 25 comments and 29 attachments in ClickUp and 3 and 2
-- here. The other 14 comments and 27 attachments are linked — by their own
-- ClickUp ids — to Estebania De La Cruz's record on the same partner. On
-- 2026-09-24 the two cards shared an email address and the first import
-- matched Jenny's card to Estebania's record; the crosswalk was corrected
-- to Jenny's own record afterwards, but the comments and files written
-- under Estebania stayed where they were, and every later pass skipped
-- them because their ids were "already linked".
--
-- Each item is moved by its ClickUp id, the key the crosswalk is written
-- under: the link, the activity event (matched on the comment's own
-- timestamp) and the file row (matched on the attachment id in its storage
-- path). Nothing is copied; nothing is deleted. Estebania's own content is
-- untouched because none of it carries one of these ids.
--
-- Cost impact: none.

begin;

do $$
declare
  v_from text := 'ce53456d-bccd-43fb-903d-f03d0b0fd00c';   -- Estebania De La Cruz
  v_to   text := '4e1714d0-008d-4e6c-b1f8-323d353a0e62';   -- Jenny Guzman
  v_links int; v_events int; v_files int; v_alinks int;
begin
  if not exists (select 1 from public.fulfillment_clients where id::text = v_to and name = 'Jenny Guzman')
     or not exists (select 1 from public.fulfillment_clients where id::text = v_from and name = 'Estebania De La Cruz') then
    raise exception 'the two records are not who this migration expects';
  end if;

  /* Comment events, by the comment's own timestamp under the wrong record. */
  with c(id, at) as (values
      ('90180256384051', '2026-09-28T16:07:44.871Z'::timestamptz),
      ('90180256383293', '2026-09-28T15:56:04.169Z'::timestamptz),
      ('90180256383264', '2026-09-28T15:54:04.294Z'::timestamptz),
      ('90180256383140', '2026-09-28T15:48:10.215Z'::timestamptz),
      ('90180256374019', '2026-09-28T14:36:13.312Z'::timestamptz),
      ('90180255560768', '2026-09-22T19:00:46.028Z'::timestamptz),
      ('90180248364973', '2026-08-19T22:35:41.007Z'::timestamptz),
      ('90180248364673', '2026-08-19T22:30:41.635Z'::timestamptz),
      ('90180248364557', '2026-08-19T22:27:22.235Z'::timestamptz),
      ('90180248364390', '2026-08-19T22:23:47.622Z'::timestamptz),
      ('90180248364272', '2026-08-19T22:20:59.493Z'::timestamptz),
      ('90180248364052', '2026-08-19T22:17:18.653Z'::timestamptz),
      ('90180248363757', '2026-08-19T22:10:20.505Z'::timestamptz),
      ('90180248363638', '2026-08-19T22:06:29.777Z'::timestamptz),
      ('90180248363461', '2026-08-19T22:03:13.161Z'::timestamptz),
      ('90180248362301', '2026-08-19T22:00:22.163Z'::timestamptz),
      ('90180248360681', '2026-08-19T21:57:36.766Z'::timestamptz),
      ('90180247576182', '2026-08-17T13:49:29.628Z'::timestamptz),
      ('90180247084004', '2026-08-14T21:17:41.880Z'::timestamptz),
      ('90180247083445', '2026-08-14T21:03:16.310Z'::timestamptz),
      ('90180246800290', '2026-08-13T19:18:33.384Z'::timestamptz),
      ('90180246780264', '2026-08-13T16:53:09.570Z'::timestamptz),
      ('90180246780248', '2026-08-13T16:52:56.453Z'::timestamptz),
      ('90180246756105', '2026-08-13T14:57:15.686Z'::timestamptz),
      ('90180246013213', '2026-08-11T19:04:06.170Z'::timestamptz)
  )
  update public.activity_events a
     set entity_id = v_to
    from c
   where a.entity_type = 'fulfillment_client' and a.entity_id = v_from
     and a.action = 'Imported from ClickUp' and a.created_at = c.at;
  get diagnostics v_events = row_count;

  update public.import_links il set entity_id = v_to
   where il.source_kind = 'comment' and il.entity_id = v_from and il.source_id in ('90180256384051','90180256383293','90180256383264','90180256383140','90180256374019','90180255560768','90180248364973','90180248364673','90180248364557','90180248364390','90180248364272','90180248364052','90180248363757','90180248363638','90180248363461','90180248362301','90180248360681','90180247576182','90180247084004','90180247083445','90180246800290','90180246780264','90180246780248','90180246756105','90180246013213');
  get diagnostics v_links = row_count;

  /* Files, by the attachment id ClickUp put in the storage path. */
  update public.files f set entity_id = v_to
   where f.entity_type = 'fulfillment_client' and f.entity_id = v_from
     and exists (select 1 from unnest(array['a5dc6280-19ba-4f07-88e6-096e2ec79608','1f40143d-c243-4135-a194-ecdb8bd6839f','d0377bd0-246c-4965-9eba-7fba6cd6794a','78f7218d-9351-4aef-8d4d-3a06a8eea5d5','a8874514-3048-440d-8892-e9f0c83b7ba8','ac7c5c03-a53c-4508-bb3e-a25e7d693b1d','19b61a51-166d-4c3e-8049-903ab62346f8','2e28e640-9443-426b-8f4b-82b546d8056a','b7764272-afce-4fe9-bbd2-2f098229af67','11c43cbc-aa73-462c-853f-00ff45e3a39d','652ddcb8-ae1a-40b3-b427-80a65df9ba29','bc0f7ce0-0d7b-4445-9e06-f913b154c115','61131c33-21bd-4c53-a776-4c1e2e3d7f67','7c1ebe54-1d29-4f77-b677-d4284c8478f5','395b4be6-1357-4e25-b8e4-8d22a3d2f1df','1c40ff5e-75d2-4f05-83e7-193782f97964','1c839be4-1b56-4052-aefa-07184bc8b64d','c137fce1-0942-452c-803e-535d92a2f78e','9c48a40c-b3fc-4e64-8249-9794c7c9e15e','bdce7893-ee72-4ffa-bd69-d9f7624b0ac1','dd736642-4dcb-42b2-8573-2432d30324a2','df6cf4bc-5af7-49f3-8d58-a8128e27edde','7e9fb359-aac0-4e24-9491-dd300602f5c2','1431afa6-73aa-4606-b53c-b43be6ef6028','c0b98211-322e-4349-81e8-3ae9592f5b51','69833d94-0334-43ea-b450-23772d0e261d','cbdc6b1a-1d2b-47c2-8cf4-497c22d0ece9','3a7904be-1be2-46ed-9770-fef0e6ee9a41','e6bc83b7-d6f8-4ed2-ae13-14daae6c3468']) u(id) where f.path like '%' || u.id || '%');
  get diagnostics v_files = row_count;

  update public.import_links il set entity_id = v_to
   where il.source_kind = 'attachment' and il.entity_id = v_from and il.source_id in ('a5dc6280-19ba-4f07-88e6-096e2ec79608.png','1f40143d-c243-4135-a194-ecdb8bd6839f.png','d0377bd0-246c-4965-9eba-7fba6cd6794a.pdf','78f7218d-9351-4aef-8d4d-3a06a8eea5d5.png','a8874514-3048-440d-8892-e9f0c83b7ba8.png','ac7c5c03-a53c-4508-bb3e-a25e7d693b1d.png','19b61a51-166d-4c3e-8049-903ab62346f8.png','2e28e640-9443-426b-8f4b-82b546d8056a.png','b7764272-afce-4fe9-bbd2-2f098229af67.png','11c43cbc-aa73-462c-853f-00ff45e3a39d.png','652ddcb8-ae1a-40b3-b427-80a65df9ba29.png','bc0f7ce0-0d7b-4445-9e06-f913b154c115.png','61131c33-21bd-4c53-a776-4c1e2e3d7f67.png','7c1ebe54-1d29-4f77-b677-d4284c8478f5.png','395b4be6-1357-4e25-b8e4-8d22a3d2f1df.png','1c40ff5e-75d2-4f05-83e7-193782f97964.png','1c839be4-1b56-4052-aefa-07184bc8b64d.png','c137fce1-0942-452c-803e-535d92a2f78e.png','9c48a40c-b3fc-4e64-8249-9794c7c9e15e.png','bdce7893-ee72-4ffa-bd69-d9f7624b0ac1.png','dd736642-4dcb-42b2-8573-2432d30324a2.png','df6cf4bc-5af7-49f3-8d58-a8128e27edde.png','7e9fb359-aac0-4e24-9491-dd300602f5c2.png','1431afa6-73aa-4606-b53c-b43be6ef6028.png','c0b98211-322e-4349-81e8-3ae9592f5b51.png','69833d94-0334-43ea-b450-23772d0e261d.png','cbdc6b1a-1d2b-47c2-8cf4-497c22d0ece9.jpeg','3a7904be-1be2-46ed-9770-fef0e6ee9a41.jpeg','e6bc83b7-d6f8-4ed2-ae13-14daae6c3468.jpeg');
  get diagnostics v_alinks = row_count;

  raise notice 'moved % comment links, % comment events, % file rows, % attachment links', v_links, v_events, v_files, v_alinks;
  if v_links <> v_events then
    raise exception 'comment links (%) and events (%) moved do not match', v_links, v_events;
  end if;
end $$;

commit;
