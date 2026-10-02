-- Partner conversations follow the portal doctrine (Dee, 2026-10-01,
-- PARTNER_PORTAL_DOCTRINE.md, Messages):
--
--   "I would use: General · Support · Projects · Billing · Direct messages to
--    assigned BES contacts. I would not expose internal channels or internal
--    team chatter."
--
-- The four topics a partner could open were General, CreditOps, Marketing and
-- Support (0333, 2026-09-13). Projects and Billing join; CreditOps and
-- Marketing stay valid so the conversations already held in them keep their
-- history (one marketing conversation exists), but the portal no longer
-- offers them for new conversations — that is a menu decision, made in
-- portal-conversations.ts. Who may open a topic is unchanged: a contact of
-- the partner, or BES staff who can see the partner.

alter table public.channels drop constraint if exists channels_partner_topic_check;
alter table public.channels add constraint channels_partner_topic_check
  check (partner_topic is null
         or partner_topic in ('general', 'support', 'projects', 'billing', 'creditops', 'marketing'));

create or replace function public.partner_topic_channel(p_group uuid, p_topic text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_id    uuid;
  v_label text;
  v_why   text;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (public.is_partner_contact_of(p_group) or public.can_see_partner(p_group)) then
    raise exception 'Not your partner' using errcode = '42501';
  end if;

  select l.label, l.why into v_label, v_why from (values
    ('general',   'General',   'Anything about the account'),
    ('support',   'Support',   'Access and anything that is not working'),
    ('projects',  'Projects',  'Builds, campaigns, milestones and approvals'),
    ('billing',   'Billing',   'Invoices, payments and your plan'),
    ('creditops', 'CreditOps', 'Client processing, disputes and results'),
    ('marketing', 'Marketing', 'Content, campaigns and approvals')
  ) as l(topic, label, why) where l.topic = p_topic;
  if v_label is null then
    raise exception 'Unknown conversation topic' using errcode = 'P0001';
  end if;

  select c.id into v_id from public.channels c
   where c.partner_group_id = p_group and c.partner_topic = p_topic and c.archived_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.channels (partner_group_id, partner_topic, kind, name, purpose, created_by, open_to_scope)
  values (
    p_group, p_topic,
    /* 'general' is a kind as well as a topic, the way 0191 already created it;
       the others are ordinary topic channels. */
    case when p_topic = 'general' then 'general'::public.channel_kind else 'topic'::public.channel_kind end,
    v_label, v_why, v_me,
    /* Everybody assigned to the partner is in it without being added one at a
       time — the same choice 0191 made for the whole-partner conversation. */
    true
  )
  returning id into v_id;
  return v_id;
end;
$$;
