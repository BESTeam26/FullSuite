-- Go-Live Stabilization Pass (Dee, 2026-10-01), priority 1: the BES Partners
-- page called partner_client_counts(), which compared the client status to
-- 'Archived' — a value the status enum has never had since the vocabulary
-- was fixed — so every call failed with 22P02 and the page showed no client
-- counts. A client is active by its LIFECYCLE, which is the column that
-- means it; the status is the credit workflow.
begin;

create or replace function public.partner_client_counts()
returns table (group_id uuid, active_clients integer, total_clients integer)
language sql stable security definer set search_path = public as $function$
  select c.outsourcing_group_id,
         count(*) filter (where c.lifecycle = 'active')::integer,
         count(*)::integer
    from public.fulfillment_clients c
    join public.outsourcing_groups g on g.id = c.outsourcing_group_id
   where c.outsourcing_group_id is not null
     and c.is_fixture = false
     and public.is_staff_of(g.agency_id)
     and public.agency_can('partners.view')
   group by c.outsourcing_group_id
$function$;

commit;
