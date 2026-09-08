-- 0201 — The Professional Messaging Guard.
--
-- ---------------------------------------------------------------------------
-- WHAT IT IS, AND THE LINE DEE DREW AROUND IT
--
-- §35: "reduce staff sending obviously inappropriate/unprofessional messages
-- through official BES Communication. Do NOT make this a vague AI censor that
-- blocks normal business conversation."
--
-- §36 draws the line in examples, and the examples are the specification:
--
--   BLOCK    strong profanity directed at a person, slurs, harassment,
--            threats, sexually explicit workplace messages, extreme personal
--            insults, configured forbidden phrases
--
--   ALLOW    "This needs to be fixed today."
--            "The client is upset."
--            "This work is overdue."
--            "This process failed."
--            "We need an explanation."
--
--   "The guard is about professionalism, not politeness theater."
--
-- So it matches TERMS, not sentiment. Nothing here reads tone, urgency,
-- criticism or blame. A message is refused because it contains a listed word
-- or phrase and for no other reason, which is the only kind of rule that can
-- be explained to the person it stopped.
--
-- ---------------------------------------------------------------------------
-- §37 — IT MUST BE FAST
--
-- "Do NOT add a slow external AI call into every message send path by
--  default. Dee already reported sending feels delayed."
--
-- This runs inside the INSERT, in Postgres, against a small per-agency term
-- list. No network call, no model, nothing to be down. Later AI-assisted
-- review can flag messages AFTER the fact; it must never sit in the send path.
--
-- ---------------------------------------------------------------------------
-- §39 — WHO IT APPLIES TO
--
-- BES staff writing. NOT partner or organization people writing in: "Do not
-- block incoming Partner/Organization messages from being received merely
-- because an external person is angry or uses strong language. Do not silently
-- destroy client/Partner communication." An external message can be flagged
-- for review later; it is never refused.
--
-- ---------------------------------------------------------------------------
-- A NOTE ON THE DEFAULT LIST
--
-- Seeded with a small set of unambiguous strong profanity, threats and
-- sexually explicit terms. It deliberately does NOT ship a slur list. Which
-- slurs a company blocks is a policy decision with legal and cultural weight
-- that belongs to Dee and, if it matters commercially, to counsel — not to a
-- list I chose. Settings → Communication is where they are added, and the
-- guard treats a Dee-added term exactly like a built-in one.
-- ---------------------------------------------------------------------------

create table public.agency_communication_settings (
  agency_id     uuid primary key references public.agencies(id) on delete cascade,
  guard_enabled boolean not null default true,
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

comment on table public.agency_communication_settings is
  'Per-agency Communication policy. The guard is ON by default (Dee, §35) and only an owner or administrator can turn it off — an agent cannot disable their own (§40).';

create table public.communication_blocked_terms (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid references public.agencies(id) on delete cascade,
  /** A word matched on word boundaries, or a phrase matched as a substring. */
  term       text not null check (length(trim(term)) between 2 and 120),
  kind       text not null default 'word' check (kind in ('word', 'phrase')),
  category   text not null default 'profanity'
    check (category in ('profanity', 'harassment', 'threat', 'sexual', 'custom')),
  /** Built-in terms have agency_id NULL and apply everywhere. */
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index communication_blocked_terms_idx
  on public.communication_blocked_terms (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(term)));

comment on table public.communication_blocked_terms is
  'What the guard refuses. A NULL agency_id is a built-in term; a row Dee adds is treated identically. Matching is on TERMS, never on tone — see 0201''s header for why.';

/* Word-boundary matching, so "class" is not "ass" and "Scunthorpe" sends. */
create or replace function public.message_guard_hit(p_agency uuid, p_text text)
returns text language sql stable security definer set search_path = public as $function$
  select t.term
    from public.communication_blocked_terms t
   where (t.agency_id is null or t.agency_id = p_agency)
     and case t.kind
           when 'phrase' then position(lower(trim(t.term)) in lower(p_text)) > 0
           else lower(p_text) ~ ('\m' || regexp_replace(lower(trim(t.term)), '([\.\*\+\?\[\]\(\)\{\}\|\\\^\$])', '\\\1', 'g') || '\M')
         end
   limit 1
$function$;
revoke execute on function public.message_guard_hit(uuid, text) from public, anon;
grant execute on function public.message_guard_hit(uuid, text) to authenticated;

create or replace function public.enforce_message_guard()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
  v_hit    text;
begin
  /* §39: BES staff writing. An active membership is the test — the same one
     that stamps `author_is_bes`. A partner contact or an organization member
     writing in is never refused. */
  select agency_id into v_agency from public.agency_memberships
   where user_id = new.author_id and status = 'active' limit 1;
  if v_agency is null then
    return new;
  end if;

  if not coalesce((select guard_enabled from public.agency_communication_settings
                    where agency_id = v_agency), true) then
    return new;
  end if;

  v_hit := public.message_guard_hit(v_agency, new.body_text);
  if v_hit is not null then
    /* §38: the message is NOT sent, the reason is short, and the interface
       keeps the draft. The wording is the user-facing text. */
    raise exception 'Please revise this message before sending. Contains language blocked by BES communication policy.'
      using errcode = 'P0001', detail = v_hit;
  end if;
  return new;
end;
$function$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages
  for each row execute function public.enforce_message_guard();

-- ── The default list ────────────────────────────────────────────────────
insert into public.communication_blocked_terms (agency_id, term, kind, category) values
  (null, 'fuck', 'word', 'profanity'),
  (null, 'fucking', 'word', 'profanity'),
  (null, 'fucked', 'word', 'profanity'),
  (null, 'motherfucker', 'word', 'profanity'),
  (null, 'cunt', 'word', 'profanity'),
  (null, 'bitch', 'word', 'profanity'),
  (null, 'bastard', 'word', 'profanity'),
  (null, 'asshole', 'word', 'profanity'),
  (null, 'dickhead', 'word', 'profanity'),
  (null, 'shut the hell up', 'phrase', 'harassment'),
  (null, 'shut the fuck up', 'phrase', 'harassment'),
  (null, 'i will hurt you', 'phrase', 'threat'),
  (null, 'i''ll hurt you', 'phrase', 'threat'),
  (null, 'i will kill you', 'phrase', 'threat'),
  (null, 'watch your back', 'phrase', 'threat'),
  (null, 'kill yourself', 'phrase', 'harassment'),
  (null, 'you are worthless', 'phrase', 'harassment'),
  (null, 'you''re worthless', 'phrase', 'harassment'),
  (null, 'send nudes', 'phrase', 'sexual')
on conflict do nothing;

-- ── Who may change it (§40) ─────────────────────────────────────────────
alter table public.agency_communication_settings enable row level security;
alter table public.communication_blocked_terms enable row level security;
revoke all on public.agency_communication_settings, public.communication_blocked_terms from public, anon;
grant select, insert, update on public.agency_communication_settings to authenticated;
grant select, insert, delete on public.communication_blocked_terms to authenticated;

/* Staff may READ the policy that applies to them — being refused by a rule
   you cannot look up is its own problem. */
create policy agency_communication_settings_select on public.agency_communication_settings
  for select to authenticated using (public.is_staff_of(agency_id));
create policy agency_communication_settings_insert on public.agency_communication_settings
  for insert to authenticated with check (public.is_admin_of(agency_id));
create policy agency_communication_settings_update on public.agency_communication_settings
  for update to authenticated
  using (public.is_admin_of(agency_id)) with check (public.is_admin_of(agency_id));

create policy communication_blocked_terms_select on public.communication_blocked_terms
  for select to authenticated
  using (agency_id is null or public.is_staff_of(agency_id));
/* A built-in term (agency_id null) cannot be added or removed by anybody
   through the API: `is_admin_of(null)` is false. */
create policy communication_blocked_terms_insert on public.communication_blocked_terms
  for insert to authenticated with check (public.is_admin_of(agency_id));
create policy communication_blocked_terms_delete on public.communication_blocked_terms
  for delete to authenticated using (public.is_admin_of(agency_id));

/* §88 — changing the policy is an administrative event and is audited. */
create or replace function public.audit_communication_settings()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.log_audit('Communication guard changed', 'agency', new.agency_id::text, null,
    case when tg_op = 'UPDATE' then jsonb_build_object('guardEnabled', old.guard_enabled) end,
    jsonb_build_object('guardEnabled', new.guard_enabled));
  return new;
end;
$function$;
drop trigger if exists agency_communication_settings_audit on public.agency_communication_settings;
create trigger agency_communication_settings_audit
  after insert or update on public.agency_communication_settings
  for each row execute function public.audit_communication_settings();
