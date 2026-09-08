-- 0186 — the credit report / disputes / letters screens are not for everybody.
--
-- Dee: "If the Partner/client is not using CreditOps as the Credit Repair CRM,
-- disable or REMOVE this Open client profile (report, disputes, letters)
-- COMPLETELY from the view. What I am working on are only clients with
-- outsourcing. We don't have the CreditOps CRM fully working at the moment and
-- we're not even offering them yet."
--
-- Every client file carried a link into BES's own credit-report, dispute and
-- letter screens. For an outsourcing partner who runs their own CRM — which is
-- every partner today — that link leads to a workspace their data does not
-- live in, and offers a product BES does not yet sell.
--
-- A FLAG, NOT A GUESS. `partner_operations.crm_name` is free text ("Dispute
-- Center", "CRC", "their own") and reading a product decision out of a name
-- somebody typed is how a screen appears for the wrong partner. This is an
-- explicit boolean, DEFAULT FALSE — so the link disappears for every partner
-- today, and reappears per partner when the CRM is real and sold.
alter table public.partner_operations
  add column if not exists uses_bes_credit_crm boolean not null default false;

comment on column public.partner_operations.uses_bes_credit_crm is
  'Does this partner actually run their credit work inside BES''s own CreditOps CRM? Default false: the report, dispute and letter screens are hidden unless somebody deliberately says yes. Not inferred from crm_name — a product decision read out of free text appears for the wrong partner.';
