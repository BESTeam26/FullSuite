-- `client_confirmation` joins the kinds of thing BES can be waiting on.
--
-- The enumeration was written when every action was a partner's. A client
-- confirmation is a new kind of ask, not a new table, so it is added here
-- rather than worked around by borrowing 'question' and meaning something
-- else by it.

alter table public.partner_action_items drop constraint if exists partner_action_items_kind_check;
alter table public.partner_action_items add constraint partner_action_items_kind_check
  check (kind in ('partner_confirmation', 'document_required', 'question',
                  'content_approval', 'campaign_approval', 'client_confirmation'));
