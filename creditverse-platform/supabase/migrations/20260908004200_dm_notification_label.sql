-- 0219 — a direct-message notification says WHO, not "Direct message".
--
-- 0218 labels every conversation notification with the channel's `name`. For
-- a channel that is the right answer and for a direct message it is useless:
-- `open_direct_channel` names the row the literal string 'Direct message'
-- (0193), because a direct conversation has no one name — it reads as the
-- other person, and which person that is depends on who is looking.
--
-- So the notification bell showed
--
--     Conversation · Direct message — are you free at 3?
--
-- when the one fact the recipient needs is the sender. `entity_label` is
-- written per recipient, so it can simply carry the author's name for a
-- direct conversation and the channel's name for everything else.
--
-- Nothing about WHO IS NOTIFIED changes. `channel_notifiable` is untouched,
-- the visibility still comes from `channel_notice`, and a mention still wins
-- over a direct-message notification for the same message.

create or replace function public.notify_message_recipients()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_ch       record;
  v_target   uuid;
  v_mentions uuid[] := public.mentioned_user_ids(new.body);
  v_label    text;
begin
  select * into v_ch from public.channel_notice(new.channel_id);

  /* No agency, no notification — and above all, no failed INSERT. An AFTER
     INSERT trigger that raises takes the message with it (0174, 0196, 0206). */
  if v_ch.agency_id is null then
    return new;
  end if;

  /* What to call the conversation. The author for a direct one, because that
     is what the recipient recognises; the channel's own name otherwise. */
  if v_ch.is_direct then
    select coalesce(nullif(trim(p.full_name), ''), p.email, 'Someone')
      into v_label
      from public.profiles p where p.id = new.author_id;
  else
    v_label := v_ch.label;
  end if;

  /* ── Mentions ────────────────────────────────────────────────────────── */
  foreach v_target in array v_mentions loop
    continue when v_target = new.author_id;
    /* Named, but must still be able to reach the conversation. Naming
       somebody does not admit them to it (§27). */
    continue when not public.channel_notifiable(new.channel_id, v_target);

    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    values (v_target, new.author_id, v_ch.agency_id, v_ch.organization_id, 'mention',
            'channel', new.channel_id::text, v_label, v_ch.visibility,
            'You were mentioned', left(new.body_text, 280))
    on conflict do nothing;
  end loop;

  /* ── Direct messages ─────────────────────────────────────────────────
     A DM is addressed to a person, so it is told without an @. Members
     only, `channel_notifiable` re-checked so a conversation somebody has
     been removed from stops pinging them, and anybody already mentioned
     above is skipped rather than notified twice about one message. */
  if v_ch.is_direct then
    insert into public.notifications
      (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
       entity_label, visibility, title, detail)
    select m.user_id, new.author_id, v_ch.agency_id, v_ch.organization_id, 'dm',
           'channel', new.channel_id::text, v_label, v_ch.visibility,
           'New direct message', left(new.body_text, 280)
      from public.channel_members m
     where m.channel_id = new.channel_id
       and m.user_id <> new.author_id
       and not (m.user_id = any (coalesce(v_mentions, '{}'::uuid[])))
       and public.channel_notifiable(new.channel_id, m.user_id)
    on conflict do nothing;
  end if;

  return new;
end $function$;
revoke execute on function public.notify_message_recipients() from public, anon, authenticated;

comment on function public.notify_message_recipients() is
  'Mentions and direct messages, one trigger on `messages`. Visibility comes from channel_notice() rather than a literal (the 0218 §A fix); a direct conversation is labelled with its AUTHOR, because "Direct message" is not a name (0219).';
