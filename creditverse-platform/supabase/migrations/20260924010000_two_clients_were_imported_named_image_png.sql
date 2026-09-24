-- Two clients arrived in CreditOps called "image.png".
--
-- The ClickUp importer prefers the name parsed from the card's own text over
-- the card's title, which is right — a card titled "Jane S." whose body says
-- "Jane Marie Smith" should import the full name. But two of Tiffany Hunter's
-- cards carry an inline screenshot, and the parser lifted the image's
-- filename as the client's name:
--
--   86exr3d4j  Tiffany Hunter        → "image.png"
--   86expumaa  Alaysia Saint Furcy   → "image.png"
--
-- The function now refuses a parsed name that has no letters in it or ends in
-- a file extension, falls back to the card title, and says so in the import
-- summary rather than silently choosing. This repairs the two rows that were
-- already written, from the ClickUp card titles.
--
-- The canonical `clients` record carries the same wrong name and is fixed with
-- it; first and last are re-split from the corrected full name.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  m text[][] := array[
    array['86exr3d4j', 'Tiffany Hunter'],
    array['86expumaa', 'Alaysia Saint Furcy']
  ];
  i int;
  v_fc uuid;
  v_client uuid;
  v_rows int := 0;
begin
  for i in 1 .. array_length(m, 1) loop
    select l.entity_id::uuid into v_fc
      from public.import_links l
     where l.source_system = 'clickup' and l.source_kind = 'task'
       and l.source_id = m[i][1] and l.entity_type = 'fulfillment_client';
    if v_fc is null then
      raise exception 'no imported client for ClickUp task %', m[i][1];
    end if;

    /* Only repair what is actually wrong. If somebody has already renamed it
       by hand, that is a person's decision and it stands. */
    update public.fulfillment_clients
       set name = m[i][2], updated_at = now()
     where id = v_fc and name ~* '\.(png|jpe?g|gif|webp)$'
     returning client_id into v_client;

    if v_client is not null then
      update public.clients
         set first_name = split_part(m[i][2], ' ', 1),
             last_name  = nullif(btrim(substr(m[i][2], length(split_part(m[i][2], ' ', 1)) + 1)), ''),
             updated_at = now()
       where id = v_client;
      v_rows := v_rows + 1;
    end if;
  end loop;

  raise notice 'repaired % of % names', v_rows, array_length(m, 1);
end $$;

/* No client in the agency is named after a file. */
do $$
declare v_bad text;
begin
  select string_agg(name, ', ') into v_bad
    from public.fulfillment_clients
   where name ~* '\.(png|jpe?g|gif|webp|pdf|heic|docx?|xlsx?|csv)$';
  if v_bad is not null then
    raise exception 'clients still named after a file: %', v_bad;
  end if;
end $$;

commit;
