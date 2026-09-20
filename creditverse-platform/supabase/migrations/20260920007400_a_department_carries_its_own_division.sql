-- A department belongs to a division. The hour does not decide that.
--
-- The first cut read the division off the FACT — the timer's division for an
-- hour, the service for a production row — and then looked the department up
-- inside it. That works for production and breaks for time: an hour booked to
-- `admin` matches no division, so the department was left unscoped and the
-- same department appeared twice, once as "Automation Department" and once as
-- "Automation Department · BES CRM".
--
-- Which is backwards. Automation Department is in BES CRM whatever anybody
-- books an hour to. The department is resolved first and the division comes
-- FROM IT; the fact's own service only breaks a tie, which is what makes
-- CreditOps' "Support" resolve to CreditOps and not to FundingOps'.
--
-- Admin and meeting hours therefore land in the division of the person who
-- logged them, which is what Dee asked for: "inherit the department they
-- belong to as much as possible."

create or replace view public.report_facts_scoped as
  select f.*,
         coalesce(dep.division_id, dvs.id)                          as division_id,
         coalesce(dep.division_name, dvs.name, f.service, '—')      as division,
         dep.id                                                     as department_id,
         /* Labelled with its division, because "Support" on its own is the
            ambiguity this view exists to remove. */
         case
           when dep.id is not null then dep.name || ' · ' || dep.division_name
           when f.department is not null then f.department
           else '—'
         end                                                        as department_scoped
    from public.report_facts f
    /* The division the FACT names, if any — a tie-breaker, and the answer for
       a fact with no department at all. */
    left join public.divisions dvs
      on dvs.archived_at is null and dvs.service::text = f.service
    left join lateral (
      select d.id, d.name, d.division_id, dv.name as division_name
        from public.departments d
        join public.divisions dv on dv.id = d.division_id and dv.archived_at is null
       where d.archived_at is null
         and f.department is not null
         and (lower(d.key) = lower(f.department) or lower(d.name) = lower(f.department))
       /* Prefer a department in the fact's own division — that is what keeps
          CreditOps' Support out of FundingOps — then prefer a key match, since
          the production enum says 'Support' where the structure says 'Client
          Success'. */
       order by (dv.service::text = f.service) desc,
                (lower(d.key) = lower(f.department)) desc,
                d.name
       limit 1
    ) dep on true;

comment on view public.report_facts_scoped is
  'report_facts with the department resolved to one row and the division taken FROM that department, so a department appears once however the hour was booked.';
revoke all on public.report_facts_scoped from public, anon;
grant select on public.report_facts_scoped to authenticated;
