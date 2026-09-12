-- =============================================================================
-- Partner credits, as a ledger.
--
-- Dee: "Do NOT make the balance a manually editable integer. Derive it from
-- ledger transactions."
--
-- A mutable counter answers "how many are left" and nothing else. The moment
-- somebody disputes a round, or a purchase is reversed, or two agents process
-- the same client at once, the number is wrong and there is no way to find out
-- why. A ledger answers "how many are left" AND "how did we get here", and the
-- second question is the one that settles arguments with a partner.
--
-- ── ONE TABLE, SIGNED QUANTITIES ────────────────────────────────────────────
--
-- Purchases and promotions are positive; usage and expiry are negative; an
-- adjustment is whichever it needs to be. The balance is `sum(quantity)`, and
-- there is deliberately nowhere to store it.
--
-- This is NOT `ai_credit_ledger` — that is per-ORGANIZATION AI usage, a
-- different customer, a different unit and a different product. Reusing it
-- would put a partner's CreditOps rounds in the same column as an
-- organization's model calls.
--
-- ── UNITS ───────────────────────────────────────────────────────────────────
--
-- `unit` names WHAT is being counted, so per-client and per-round CreditOps
-- billing can coexist with anything sold later without a second table. It is
-- text, not an enum, because Dee sells what she sells.
-- =============================================================================

create table if not exists public.partner_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,

  /** What happened. Signed quantity below carries the direction. */
  kind text not null check (kind in (
    'purchase',      -- they bought credits
    'promotional',   -- BES granted them
    'usage',         -- consumed by work
    'adjustment',    -- a correction somebody made deliberately
    'reversal',      -- undoing an earlier row, which stays
    'refund',        -- credits returned as part of a refund
    'expiry'         -- lapsed, if Dee ever turns expiry on
  )),
  /** What is being counted — `creditops_round`, `creditops_client`, … */
  unit text not null default 'creditops_round',
  /** Positive adds, negative consumes. Never zero: a row that changes nothing is noise. */
  quantity integer not null check (quantity <> 0),

  description text,
  /** What it was spent on, when it was spent on something. */
  fulfillment_client_id uuid references public.fulfillment_clients(id) on delete set null,
  round text,
  /** What it was bought on, when it was bought. */
  invoice_id uuid references public.partner_invoices(id) on delete set null,
  /** The row this one undoes. A reversal never edits history, it answers it. */
  reverses_id uuid references public.partner_credit_ledger(id) on delete restrict,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.partner_credit_ledger is
  'Every movement of a partner''s prepaid credits. The balance is sum(quantity) and is deliberately stored nowhere — a mutable counter cannot say how it got there, and that is the question that settles a dispute (Dee, 2026-09-13).';

create index if not exists partner_credit_ledger_by_partner
  on public.partner_credit_ledger (group_id, unit, created_at desc);

/* One reversal per row. Reversing twice is how a balance grows by accident. */
create unique index if not exists partner_credit_ledger_one_reversal
  on public.partner_credit_ledger (reverses_id) where reverses_id is not null;

alter table public.partner_credit_ledger enable row level security;
grant select, insert on public.partner_credit_ledger to authenticated;

/* Reading credits is reading money, so it follows the owner-gated invoice
   capability rather than inventing a twelfth key nobody would remember to
   grant. Admin alone does not qualify — `partners.invoices.view` is
   owner_gated, which is what makes that true. */
drop policy if exists partner_credit_ledger_select on public.partner_credit_ledger;
create policy partner_credit_ledger_select on public.partner_credit_ledger
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));

drop policy if exists partner_credit_ledger_write on public.partner_credit_ledger;
create policy partner_credit_ledger_write on public.partner_credit_ledger
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.manage'));

/* No UPDATE and no DELETE policy, deliberately. A ledger that can be edited is
   not a ledger — a mistake is corrected by a reversal, which leaves both rows
   visible (rule 11). The owner may still delete through the table owner's own
   rights if a row was created in genuine error. */

/**
 * A partner's credits: bought, used, and what is left.
 *
 * `security_invoker`, so a reader who may not see partner money sees no rows
 * and therefore no balance — rather than a zero, which would read as "they
 * have none left".
 */
create or replace view public.partner_credit_balance as
  select group_id,
         unit,
         sum(quantity) filter (where quantity > 0)::bigint            as added,
         abs(sum(quantity) filter (where quantity < 0))::bigint       as used,
         sum(quantity)::bigint                                        as available,
         max(created_at)                                              as last_movement
    from public.partner_credit_ledger
   group by group_id, unit;

alter view public.partner_credit_balance set (security_invoker = true);
comment on view public.partner_credit_balance is
  'Derived credit balance per partner and unit. There is no stored counter to drift from this (2026-09-13).';
grant select on public.partner_credit_balance to authenticated;

/**
 * Spend one credit on a piece of work.
 *
 * SECURITY DEFINER because the person consuming a credit is a CreditOps agent
 * who must not be able to see, let alone write, partner money — they process a
 * round; the ledger entry is a consequence, not something they author. The
 * function therefore checks that the CALLER may work this client rather than
 * that they may edit billing.
 *
 * Refuses to go negative. A partner who has run out has run out, and silently
 * lending them credits is how an invoice goes unsent.
 */
create or replace function public.spend_partner_credit(
  p_client uuid,
  p_unit text default 'creditops_round',
  p_quantity integer default 1,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c public.fulfillment_clients%rowtype;
  v_balance bigint;
  v_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Spend at least one credit' using errcode = '22023';
  end if;

  select * into c from public.fulfillment_clients where id = p_client;
  if c.id is null then
    raise exception 'That client does not exist' using errcode = '22023';
  end if;
  if c.outsourcing_group_id is null then
    raise exception 'That client has no partner to charge' using errcode = '22023';
  end if;
  /* The caller's own right to touch this client, not a billing right. */
  if not public.can_view_work(c.agency_id, c.organization_id, c.outsourcing_group_id) then
    raise exception 'That client is not yours to work' using errcode = '42501';
  end if;

  select coalesce(sum(quantity), 0) into v_balance
    from public.partner_credit_ledger
   where group_id = c.outsourcing_group_id and unit = p_unit;

  if v_balance < p_quantity then
    raise exception 'This partner has % % credits left, and this needs %',
      v_balance, p_unit, p_quantity using errcode = '22023';
  end if;

  insert into public.partner_credit_ledger
    (agency_id, group_id, kind, unit, quantity, description, fulfillment_client_id, round, created_by)
  values (c.agency_id, c.outsourcing_group_id, 'usage', p_unit, -p_quantity,
          coalesce(p_description, c.name || ' · ' || coalesce(c.round::text, 'round')),
          c.id, c.round::text, auth.uid())
  returning id into v_id;

  perform public.log_audit('partner.credit_spent', 'partner', c.outsourcing_group_id::text, null, null,
    jsonb_build_object('client', c.id, 'unit', p_unit, 'quantity', p_quantity, 'balance_after', v_balance - p_quantity));
  return v_id;
end $function$;
revoke execute on function public.spend_partner_credit(uuid, text, integer, text) from public, anon;
grant execute on function public.spend_partner_credit(uuid, text, integer, text) to authenticated;

/**
 * Undo a ledger row without editing it.
 *
 * The original stays exactly as written and a mirror-image row is added beside
 * it, so the history reads "we charged this, then we put it back" rather than
 * "this never happened".
 */
create or replace function public.reverse_partner_credit(
  p_entry uuid, p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  e public.partner_credit_ledger%rowtype;
  v_id uuid;
begin
  select * into e from public.partner_credit_ledger where id = p_entry;
  if e.id is null then
    raise exception 'That credit entry does not exist' using errcode = '22023';
  end if;
  if not (public.is_staff_of(e.agency_id) and public.agency_can('partners.invoices.manage')) then
    raise exception 'Adjusting partner credits is owner-granted' using errcode = '42501';
  end if;
  if exists (select 1 from public.partner_credit_ledger r where r.reverses_id = p_entry) then
    raise exception 'That entry has already been reversed' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why it is being reversed' using errcode = '22023';
  end if;

  insert into public.partner_credit_ledger
    (agency_id, group_id, kind, unit, quantity, description,
     fulfillment_client_id, round, invoice_id, reverses_id, created_by)
  values (e.agency_id, e.group_id, 'reversal', e.unit, -e.quantity, btrim(p_reason),
          e.fulfillment_client_id, e.round, e.invoice_id, e.id, auth.uid())
  returning id into v_id;

  perform public.log_audit('partner.credit_reversed', 'partner', e.group_id::text, null,
    jsonb_build_object('entry', e.id, 'quantity', e.quantity),
    jsonb_build_object('reversal', v_id, 'reason', p_reason));
  return v_id;
end $function$;
revoke execute on function public.reverse_partner_credit(uuid, text) from public, anon;
grant execute on function public.reverse_partner_credit(uuid, text) to authenticated;
