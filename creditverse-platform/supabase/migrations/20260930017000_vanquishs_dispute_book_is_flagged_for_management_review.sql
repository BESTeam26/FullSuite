-- Vanquish's Dispute book is flagged for management review.
--
-- Dee, 2026-09-30: "Flag the Vanquish actionable Dispute clients currently
-- assigned to Daniel for management review. Do not redistribute them
-- automatically yet. I want the workload/assignment logic reviewed first so
-- one agent does not accidentally receive an entire large Partner book just
-- because of continuity or same-partner batching."
--
-- What happened: when 177 files were re-routed away from fixture accounts,
-- the picker's same-partner-batch rule — one DisputeFox and one SOP before
-- the next company — sent every Vanquish Ventures file to whoever held the
-- first one. Daniel now holds all of them. The rule did what it says; the
-- question is whether it should say that for a book this size, and that is
-- a management decision, not a migration's.
--
-- So: nothing moves. Each of those clients carries a [workload review] tag,
-- which the Client Directory's review filter shows as its own category, and
-- the picker is untouched. Idempotent: a client already tagged is skipped.
--
-- Cost impact: none.

begin;

with held as (
  select distinct fc.client_id, g.name as partner, p.full_name as holder
    from public.client_department_statuses d
    join public.fulfillment_clients fc on fc.id = d.client_id and fc.archived_at is null and not fc.is_fixture
    join public.outsourcing_groups g on g.id = fc.outsourcing_group_id and g.name = 'Vanquish Ventures'
    join public.profiles p on p.id = d.assignee_id
   where d.department = 'Dispute'
     and public.creditops_status_is_actionable(d.department, d.status)
     and d.assignment_method = 'automatic'
)
update public.clients c
   set needs_review = true,
       review_note = case when coalesce(c.review_note, '') like '%[workload review]%' then c.review_note
                          else concat_ws(E'\n', nullif(c.review_note, ''),
                               '[workload review] One of the ' || (select count(*) from held) || ' ' || h.partner
                               || ' Dispute files routed to ' || h.holder
                               || ' by the same-partner-batch rule on 2026-09-30. Management reviews the '
                               || 'assignment rule before any redistribution; nothing moves automatically.') end
  from held h
 where c.id = h.client_id;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.clients where review_note like '%[workload review]%';
  raise notice '% clients flagged for workload review', v_n;
end $$;

commit;
