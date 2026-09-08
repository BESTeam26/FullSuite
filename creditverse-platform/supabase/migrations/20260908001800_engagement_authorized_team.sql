-- 0195 — The team an engagement authorizes, by ID.
--
-- ---------------------------------------------------------------------------
-- THE GAP §10 EXPOSED
--
-- Dee: "Organization ABC #client-support, shared with BES. Team Ally is
-- assigned to support ABC. Expected: authorized Team Ally members see the
-- channel. Unrelated GHL Agent: does not see it merely because the
-- Organization checked Share with BES."
--
-- The second half already held. The FIRST half did not, and measuring it is
-- what showed why: `channel_shared_with_bes` calls
-- `in_scope(agency, service, NULL, NULL, NULL)` — with no team. So the scope
-- ladder resolved like this for the people who actually do the work:
--
--   agency scope    (owner, admin)     → in
--   division scope  (a manager)        → in, if the service matches
--   team scope      (a team lead)      → OUT. p_team was null.
--   assigned scope  (an agent)         → OUT.
--
-- Nobody below manager level could read a channel their customer had shared
-- with BES specifically so that they could work in it. Sharing worked; the
-- people it was shared for could not see it.
--
-- ---------------------------------------------------------------------------
-- WHY THE FIX GOES ON THE ENGAGEMENT AND NOT ON THE CHANNEL
--
-- The tempting fix is to let BES add its own team to the organization's
-- channel. That is a self-grant, and 0104's doctrine is explicit: "BES may
-- never self-share a channel or grant itself access." Even gated behind the
-- share it would be BES writing into the customer's channel to decide who at
-- BES reads it.
--
-- The engagement is the honest place. It IS the commercial relationship, it
-- already carries `service`, `status` and dates, and BES naming which of its
-- teams staffs it is a BES fact about BES people. Set once, every channel that
-- organization shares follows — and when somebody joins or leaves the team,
-- access moves with them and nobody edits a channel (Dee, §12, §32).
--
-- `authorized_team` (text) stays exactly where it is and is STILL never read
-- by anything that decides access. A team NAME is not an authorization
-- identity (rule 4), and the new column is deliberately not backfilled from
-- it: resolving a grant out of a display string once is still resolving a
-- grant out of a display string.
-- ---------------------------------------------------------------------------

alter table public.fulfillment_engagements
  add column if not exists authorized_team_id uuid references public.teams(id) on delete set null;

create index if not exists fulfillment_engagements_team_idx
  on public.fulfillment_engagements (authorized_team_id) where authorized_team_id is not null;

comment on column public.fulfillment_engagements.authorized_team_id is
  'The BES team staffing this engagement. Narrows who at BES may reach what the customer shared, and is inherited through team membership so joining and leaving the team is the only edit (Dee, §10, §32). Deliberately NOT backfilled from the legacy `authorized_team` text: a name is not an authorization identity (rule 4).';
comment on column public.fulfillment_engagements.authorized_team is
  'LEGACY, descriptive only. Never read by any authorization function. `authorized_team_id` is the one that decides anything.';

/* An engagement's team must belong to the agency on the engagement. A foreign
   key proves the team exists, not that it is ours. */
create or replace function public.engagement_team_matches()
returns trigger language plpgsql set search_path = public as $function$
declare v_agency uuid;
begin
  if new.authorized_team_id is null then return new; end if;
  select agency_id into v_agency from public.teams where id = new.authorized_team_id;
  if v_agency is distinct from new.agency_id then
    raise exception 'That team belongs to a different agency' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
drop trigger if exists fulfillment_engagements_team_check on public.fulfillment_engagements;
create trigger fulfillment_engagements_team_check
  before insert or update of authorized_team_id on public.fulfillment_engagements
  for each row execute function public.engagement_team_matches();

-- ── BES reach into a shared organization channel ────────────────────────
--
-- Three things still have to hold, unchanged since 0104, and the customer
-- still controls all three: a share exists, it has not been withdrawn, and the
-- engagement behind it is LIVE. Nothing below can grant access without them.
--
-- What changed is the fourth test — which of BES's people. Either the ordinary
-- scope ladder (now told which team the engagement authorizes, so a team lead
-- resolves instead of falling through), or membership of that team, which is
-- what reaches the agents who do the work.
create or replace function public.channel_shared_with_bes(p_channel uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.channel_shares s
      join public.fulfillment_engagements e on e.id = s.engagement_id
      join public.channels c on c.id = s.channel_id
     where s.channel_id = p_channel
       and s.revoked_at is null
       and e.organization_id = c.organization_id
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and public.is_staff_of(e.agency_id)
       and (
         public.in_scope(e.agency_id, e.service, e.authorized_team_id, null, null)
         or (
           e.authorized_team_id is not null
           and exists (
             select 1
               from public.team_memberships tm
               join public.teams t on t.id = tm.team_id
              where tm.team_id = e.authorized_team_id
                and tm.user_id = auth.uid()
                and t.archived_at is null
           )
         )
       )
  )
$function$;

comment on function public.channel_shared_with_bes(uuid) is
  'BES reach into ONE organization channel. The customer decides whether BES is in at all (a share, unrevoked, against a live engagement); BES decides which of its people, through the engagement''s authorized team. Neither half can be skipped (Dee, §10).';
