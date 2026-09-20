-- The round is not merely SET by the stage; it is KEPT equal to it.
--
-- Dee, 2026-09-20: "that table should be automatically set if the agent chose
-- round sent and round should be equal to that round."
--
-- 005100 fired only `before insert or update OF status`, so it set the round
-- when the stage changed and then stopped watching. An agent could afterwards
-- edit the round on its own — there is a dropdown for it on the client card —
-- and leave a client reading "Round 3 Sent" with a round of 5. The very
-- disagreement the trigger existed to prevent was one edit away.
--
-- It now fires on every insert and update. Whenever the stage names a round,
-- the round IS that round, whatever the statement tried to set it to. A stage
-- that names no round leaves the round alone, so moving a client to Support
-- or Complaints does not forget which round they reached.

create or replace function public.round_follows_the_status() returns trigger
language plpgsql set search_path = public as $function$
declare v_n text;
begin
  v_n := substring(new.status::text from '^Round ([0-9]+) Sent$');
  if v_n is not null then
    /* Unconditional: this wins over anything the statement set, because the
       stage is what an agent chooses and the round is what follows. */
    new.round := ('Round ' || v_n)::public.fulfillment_round;
  end if;
  return new;
end $function$;

drop trigger if exists fulfillment_clients_round_follows_status on public.fulfillment_clients;
create trigger fulfillment_clients_round_follows_status
  before insert or update on public.fulfillment_clients
  for each row execute function public.round_follows_the_status();

comment on trigger fulfillment_clients_round_follows_status on public.fulfillment_clients is
  'While the stage is "Round N Sent" the round IS Round N, on every write and by every path. The stage is chosen; the round follows (Dee, 2026-09-20).';

/* Any client already contradicting its own stage, corrected once. */
do $$
declare v_n int;
begin
  update public.fulfillment_clients c
     set status = c.status  /* the trigger recomputes the round */
   where c.status::text ~ '^Round [0-9]+ Sent$'
     and c.round::text is distinct from 'Round ' || substring(c.status::text from '^Round ([0-9]+) Sent$');
  get diagnostics v_n = row_count;
  raise notice 'Rounds brought back in step with their stage: %', v_n;
end $$;
