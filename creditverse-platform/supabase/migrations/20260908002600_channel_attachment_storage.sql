-- 0203 — A message attachment is reachable exactly when its conversation is.
--
-- ---------------------------------------------------------------------------
-- THE HOLE §26 WOULD HAVE LEFT OPEN
--
-- Dee: "A message attachment must never make a forbidden Partner /
-- Organization / Internal file public. Access should require channel access
-- AND file authorization... Do not expose permanent public Supabase Storage
-- URLs for sensitive Agency files."
--
-- 0199 gated the `files` ROW on `entity_visible('channel_message', …)`, which
-- resolves through the message and therefore through the channel. That is the
-- metadata. The OBJECT is a different table with different policies, and
-- `bes_files_select` said:
--
--     (storage.foldername(name))[1] = 'agency' and public.is_agency_staff()
--
-- Any BES staff member, any object under `agency/`. So a file attached to the
-- Leadership channel, or to a partner conversation an agent is not assigned
-- to, could be fetched by anybody on staff who had its path — and a signed URL
-- is issued to whoever may select the object. The row would have been
-- invisible and the file downloadable.
--
-- ---------------------------------------------------------------------------
-- WHY THIS REPLACES THE POLICY INSTEAD OF ADDING ONE
--
-- Permissive policies are OR-ed. A new, stricter policy beside the existing
-- one grants strictly more, not less. This project has been bitten by that
-- twice already — `agency_memberships_write` and `outsourcing_groups_write`,
-- both FOR ALL, both silently defeating the narrower SELECT beside them.
--
-- So `bes_files_select` is REPLACED with a version that routes the channels
-- subtree through `channel_visible` and leaves every other path exactly as it
-- was. Nothing outside `…/channels/…` changes by one row.
--
-- Layout:  agency/channels/<channel_id>/<file>
--          <organization_id>/channels/<channel_id>/<file>
--
-- The tenancy key stays the first segment, so an organization's attachments
-- stay inside its own prefix.
-- ---------------------------------------------------------------------------

create or replace function public.storage_channel_of(p_name text)
returns uuid language sql immutable set search_path = public as $function$
  select case
    when (storage.foldername(p_name))[2] = 'channels'
     and (storage.foldername(p_name))[3] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_name))[3])::uuid
  end
$function$;
revoke execute on function public.storage_channel_of(text) from public, anon;
grant execute on function public.storage_channel_of(text) to authenticated;

comment on function public.storage_channel_of(text) is
  'The channel a storage path belongs to, or NULL. The uuid shape is checked before the cast: a folder literally named "channels" containing something that is not a uuid must return NULL, not raise 22P02 and fail the whole policy.';

drop policy if exists bes_files_select on storage.objects;
create policy bes_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bes-files'
    and case
      /* A conversation's attachments follow the conversation. Audit reach is
         included, because `channel_visible` is not what an administrator uses
         to read a channel — an auditor who can read the message can read what
         was attached to it, which is the point of an audit. */
      when public.storage_channel_of(name) is not null
        then public.channel_auditable(public.storage_channel_of(name))
      /* Everything else: unchanged from 0002. */
      when (storage.foldername(name))[1] = 'agency'
        then public.is_agency_staff()
      else
        public.is_agency_staff()
        or public.is_org_member(((storage.foldername(name))[1])::uuid)
    end
  );

drop policy if exists bes_files_insert on storage.objects;
create policy bes_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bes-files'
    and owner = auth.uid()
    and case
      /* Attaching needs the right to POST, not merely to read: an
         administrator inspecting a conversation cannot drop a file into it. */
      when public.storage_channel_of(name) is not null
        then public.channel_writable(public.storage_channel_of(name))
      when (storage.foldername(name))[1] = 'agency'
        then public.is_agency_staff()
      else
        public.is_agency_staff()
        or public.is_org_member(((storage.foldername(name))[1])::uuid)
    end
  );

/* Delete is unchanged in substance — your own object, or a manager — but is
   restated so all three policies read from one place. */
drop policy if exists bes_files_delete on storage.objects;
create policy bes_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'bes-files'
    and (owner = auth.uid() or public.is_agency_manager_or_above())
  );
