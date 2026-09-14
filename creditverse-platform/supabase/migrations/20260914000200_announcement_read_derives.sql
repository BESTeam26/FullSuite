-- 0350 — the last live reader of a deprecated column.
--
-- `announcements_select` gated a department-targeted announcement on
-- `am.scope_department_id`, the same column nobody maintains. So such an
-- announcement was not merely un-notified (0349) — it was unreadable by the
-- very department it was addressed to.
--
-- Same one-line derivation, on the read path. The rest of the policy is
-- reproduced exactly as it stood.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    archived_at is null
    and (
      /* An organization's own announcement. */
      (
        organization_id is not null
        and public.is_org_member(organization_id)
        and (published_at is not null or public.member_can(organization_id, 'settings.manage'))
      )
      /* BES speaking to every organization. */
      or (
        organization_id is null
        and audience = 'all_organizations'::public.announcement_audience
        and (published_at is not null or public.is_agency_staff())
      )
      /* BES speaking to itself. */
      or (
        organization_id is null
        and audience = 'bes_internal'::public.announcement_audience
        and public.is_agency_staff()
        and (not managers_only or public.is_agency_manager_or_above())
        /* Derived from live team membership (0350), was scope_department_id. */
        and (
          department_id is null
          or department_id in (select public.my_departments())
        )
        and (
          team_id is null
          or public.is_member_of_team(team_id)
          or public.is_agency_manager_or_above()
        )
      )
    )
  );

comment on policy announcements_select on public.announcements is
  'Read an announcement. Department targeting derives from live team membership; the deprecated scope columns are read by no policy (0350).';
