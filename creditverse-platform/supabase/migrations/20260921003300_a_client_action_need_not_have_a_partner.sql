-- A client action belongs to a client, not necessarily to a partner.
--
-- `partner_action_items.group_id` was NOT NULL, which was right while every
-- row was a partner's. A client action is about the client's own file and the
-- client may be held directly by an organization, or by nobody in particular,
-- so the column has to allow null — and the partner invariant has to survive
-- that, which is what the check does. NOT NULL was doing two jobs; now the
-- constraint does the one that mattered.

alter table public.partner_action_items alter column group_id drop not null;

alter table public.partner_action_items drop constraint if exists partner_action_group_when_partner;
alter table public.partner_action_items add constraint partner_action_group_when_partner
  check (audience <> 'partner' or group_id is not null);

comment on constraint partner_action_group_when_partner on public.partner_action_items is
  'A PARTNER action still names its partner. A client action need not, because the client is named by fulfillment_client_id.';
