-- Dee, 2026-09-21: "DELETE ALL CONVERSATION NOW IN THE COMMUNICATION AS WE
-- WILL START FRESH AND READY FOR USE TODAY BY THE TEAM."
--
-- Explicitly authorized by the owner. Rule 11 still applies, so this is a
-- fresh start with a way back: every row removed is copied first into an
-- `archive` schema nobody in the application can read, then removed from the
-- live tables. The CONVERSATIONS themselves — channels, members, favourites,
-- partner shares — stay exactly as they are; only what was said in them goes.
--
-- Removed: messages (69, incl. 11 already-removed tombstones), their pins,
-- reactions, edit history, saved bookmarks, read markers, and the 11 file
-- attachments (46 MB in bes-files). Nothing else in the platform references
-- a message by foreign key; work-item activity is a different stream.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;
comment on schema archive is 'Copies of live rows removed on the owner''s instruction. Never read by the application; restore by hand if ever needed.';

create table archive.messages_20260921           as select * from public.messages;
create table archive.message_pins_20260921       as select * from public.message_pins;
create table archive.message_reactions_20260921  as select * from public.message_reactions;
create table archive.message_revisions_20260921  as select * from public.message_revisions;
create table archive.saved_messages_20260921     as select * from public.saved_messages;
create table archive.channel_reads_20260921      as select * from public.channel_reads;
create table archive.message_files_20260921      as select * from public.files where entity_type = 'channel_message';

-- Dependents first, then the messages themselves.
delete from public.saved_messages;
delete from public.message_pins;
delete from public.message_reactions;
delete from public.message_revisions;
delete from public.messages;
delete from public.channel_reads;

-- The attachment RECORDS, which point at messages that no longer exist. The
-- 11 stored objects (46 MB in bes-files) stay where they are: Supabase
-- refuses SQL deletes on storage ("Use the Storage API instead"), and the
-- Storage API needs the service key this migration does not have. Their paths
-- are in archive.message_files_20260921 for a later Storage-API sweep; the
-- cost of leaving them is a few cents a month.
delete from public.files where entity_type = 'channel_message';
