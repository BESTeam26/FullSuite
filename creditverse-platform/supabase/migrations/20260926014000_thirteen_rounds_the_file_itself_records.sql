-- Thirteen of the 155 say which round they are on. The other 142 do not.
--
-- Dee asked whether the round could be read out of the card text. It can, for
-- thirteen files. I had said "many of them carry the round in their card
-- text"; that was wrong, and the number is the correction.
--
-- ── WHERE THE NUMBER CAME FROM ────────────────────────────────────────────
--
-- Three sources were checked, in order of authority:
--
--   ClickUp's "Current Round" field   empty on all 155 — that is WHY they are
--                                     here; the import reads it where it is set
--   the card description               3 files name a round in prose
--   dated notes on the file           10 files carry one, e.g. "FOR ROUND 5"
--                                     written the day the letters went out
--   attachment filenames               0 — not one of 4,042 names a round
--
-- The descriptions were read INSIDE the Edge Function and dropped there. A
-- client card's description is where SSNs, dates of birth and monitoring
-- passwords get written down; only a task id went out and only a number came
-- back. There is deliberately no mode that returns that text.
--
-- ── WHAT WAS NOT ACCEPTED ─────────────────────────────────────────────────
--
-- Only the word ROUND immediately followed by a number. "Round letters
-- uploaded to LetterStream" names no round and was not counted; a range
-- ("rounds 1-4") names no single round either. One file, James Wilkerson, has
-- notes naming two different rounds and is left alone rather than resolved by
-- guessing which note is current.
--
-- 142 files keep "In Dispute Mailed", which is true. A dispute round is an
-- FCRA record: "Round 1 Sent" on a file actually on round four is a false
-- statement about what was sent to a bureau and when, not a tidier label.
--
-- Both the round and the status are set, so the two agree. Nothing moves
-- department — both statuses route to Dispute · ROUND SENT - AWAITING RESULTS
-- — and nothing becomes actionable, because a round in the post is waiting on
-- a bureau (§23).
--
-- Cost impact: no material increase.

begin;

do $$
declare
  r record;
  v_round text; v_status text; v_prev text; v_n int := 0;
begin
  for r in
    select * from (values
      ('24887f2c-6feb-4dfd-ac6f-5c11cfca29cf'::uuid,  4, 'a dated note on the file', 'Jose Diaz-Rosales'),
      ('2bd2c4ff-4a41-476b-9dd7-4a8589193faa'::uuid,  4, 'a dated note on the file', 'Ralynn Payne'),
      ('2ee7b6aa-e106-4d19-b5ce-7cc108ff97a0'::uuid, 11, 'the card description',     'Jonathan Capitulo'),
      ('34d07877-e9ab-4cc3-808d-338df7fb9bda'::uuid,  6, 'a dated note on the file', 'Armando Rivera'),
      ('6ba5c8a4-a863-4b2b-9ae1-effd8ce55bd8'::uuid,  5, 'a dated note on the file', 'Jennifer Lopez Torres'),
      ('7f658841-8b58-4e3f-a46a-3596d305850f'::uuid,  9, 'the card description',     'Chrystal Martinez'),
      ('7f6a4c35-bd63-430e-a6de-f3fe944e4670'::uuid,  4, 'a dated note on the file', 'Maribel Ochoa'),
      ('827a1b3a-9a10-4c41-aca9-545acd7feb57'::uuid,  5, 'a dated note on the file', 'Jose Reyes-Morales'),
      ('af397e78-75b0-48fd-ae00-4e493c95106d'::uuid,  5, 'a dated note on the file', 'Bianca Rivera'),
      ('af9a1423-8eb6-4f7e-b669-07fc274dafd6'::uuid,  5, 'the card description',     'Alice Delma'),
      ('c7d8b29a-56a6-4353-804c-6f0443fee314'::uuid,  4, 'a dated note on the file', 'Daniel Gonzalez'),
      ('e539379a-d3df-4e29-91ff-6aab4c169f25'::uuid,  3, 'a dated note on the file', 'Cesar Velazquez'),
      ('f641bc15-fda5-4683-9798-9dbd695cae63'::uuid,  2, 'a dated note on the file', 'Joseph Reese Jr.')
    ) as t(client_id, n, source, expect_name)
  loop
    /* The enum's fourth value is spelled "Round 4+"; every other round is
       "Round N". Getting that wrong is a cast failure, not a silent miss. */
    v_round  := case when r.n = 4 then 'Round 4+' else 'Round ' || r.n end;
    v_status := 'Round ' || r.n || ' Sent';

    select c.status::text into v_prev
      from public.fulfillment_clients c where c.id = r.client_id;

    /* Refuse on any surprise: a file that already moved on, or an id that is
       not the person the evidence was read for. */
    if v_prev is null then
      raise exception 'client % (%) no longer exists', r.expect_name, r.client_id;
    end if;
    if v_prev <> 'In Dispute Mailed' then
      raise exception 'client % is now "%", not "In Dispute Mailed" — the evidence is stale',
        r.expect_name, v_prev;
    end if;
    if not exists (select 1 from public.fulfillment_clients
                    where id = r.client_id and name = r.expect_name) then
      raise exception 'client % is not named % — refusing to write a round onto the wrong file',
        r.client_id, r.expect_name;
    end if;

    update public.fulfillment_clients
       set status = v_status::public.fulfillment_client_status,
           round  = v_round::public.fulfillment_round,
           updated_at = now()
     where id = r.client_id;

    /* An FCRA-relevant field says where its number came from (rule 10). */
    insert into public.activity_events
      (agency_id, organization_id, entity_type, entity_id, actor_id, actor_name,
       action, detail, field, previous_value, new_value, visibility)
    select c.agency_id, c.organization_id, 'fulfillment_client', c.id::text,
           null, 'ClickUp import',
           'Data import',
           'Round established from ' || r.source || ' during the ClickUp import. '
             || 'Not set by an agent; correct it on the file if the round has moved since.',
           'status', v_prev, v_status, 'bes_internal'
      from public.fulfillment_clients c where c.id = r.client_id;

    v_n := v_n + 1;
  end loop;
  raise notice '% files now say which round is out', v_n;
end $$;

/* Nothing became actionable: a round in the post is waiting on a bureau. */
do $$
declare v_wrong int; v_left int;
begin
  select count(*) into v_wrong
    from public.fulfillment_clients fc
    join public.client_department_statuses s on s.client_id = fc.id
   where fc.status::text ~ '^Round \d+ Sent$'
     and s.department = 'Dispute'
     and public.creditops_status_is_actionable(s.department, s.status);
  if v_wrong > 0 then
    raise exception '% mailed rounds became actionable work', v_wrong;
  end if;

  select count(*) into v_left from public.fulfillment_clients where status = 'In Dispute Mailed';
  raise notice '% files keep "In Dispute Mailed" because nothing on them says which round', v_left;
end $$;

commit;
