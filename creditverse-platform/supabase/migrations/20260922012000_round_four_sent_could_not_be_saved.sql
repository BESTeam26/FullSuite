-- "Round 4 Sent" raised an error. Every other round was fine.
--
-- `round_follows_the_status()` derives the client's round from the status by
-- string arithmetic — `'Round ' || 4` — and casts it to `fulfillment_round`.
-- That enum has no `Round 4`. It has **`Round 4+`**, a leftover from when the
-- pipeline stopped counting at four, and the values 5 to 13 were appended
-- later without anybody revisiting it.
--
-- So an agent choosing `Round 4 Sent` from the dropdown got
-- `invalid input value for enum fulfillment_round: "Round 4"` and the save
-- failed. Rounds 1, 2, 3 and 5 through 12 all worked, which is exactly why it
-- survived: the round-wait probe happened to test 1, 2, 5, 10 and 12.
--
-- Mapped rather than added to the enum: a new `Round 4` value would sit beside
-- `Round 4+` meaning the same thing, which is the duplication this week has
-- been spent removing. `Round 4+` keeps its own meaning for the records that
-- already hold it.

create or replace function public.round_follows_the_status() returns trigger
language plpgsql set search_path to 'public' as $function$
declare v_n text;
begin
  v_n := substring(new.status::text from '^Round ([0-9]+) Sent$');
  if v_n is not null then
    /* Unconditional: this wins over anything the statement set, because the
       stage is what an agent chooses and the round is what follows. */
    new.round := (case when v_n = '4' then 'Round 4+' else 'Round ' || v_n end)::public.fulfillment_round;
  end if;
  return new;
end $function$;

comment on function public.round_follows_the_status() is
  'The client''s round follows the chosen status. Round 4 maps to the enum''s Round 4+, which is what that value has always been called (2026-09-22).';
