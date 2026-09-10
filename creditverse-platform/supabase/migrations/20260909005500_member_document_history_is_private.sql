-- =============================================================================
-- A team member's document HISTORY is as private as the documents.
--
-- Found by the full matrix after the document builder's browser walk: the
-- activity rows "Document sent for signature: NDA", "Document added: NDA",
-- "Document signed: NDA" about one fixture agent were readable by
-- bes.restricted — a plain staff member with no document capability. The
-- probe "restricted sees no activity" went 0 → 3.
--
-- Why: 0268 made `entity_visible('agency_member', …)` follow the membership
-- row, so that role and access-profile audits (which ARE membership facts,
-- readable by whoever can see the membership) became readable. The
-- member-documents lifecycle (0273) and the document builder (0292) write
-- their events onto the same person with the same entity type — and so a
-- colleague's NDA, agreement or signature history was visible to everyone
-- who could see the People directory. The document ROWS were gated
-- (people.documents.manage, or the person themself, 0273); their history
-- was not. Same doctrine as the pay-rate and payslip events: the event about
-- a private record is private (People Hub §15).
--
-- Fix, narrowly: the activity select policy gains one clause. Events on a
-- team member whose `field` is a document field are readable by the person
-- they are about and by holders of either document capability; every other
-- 'agency_member' event keeps 0268's rule. entity_visible() is untouched —
-- it has no access to `field`, and this is a field-level distinction.
-- =============================================================================

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
  for select to authenticated
  using (
    public.can_view_activity(agency_id, organization_id, visibility, entity_type)
    and public.entity_visible(entity_type, entity_id)
    and (
      entity_type <> 'agency_member'
      or field is null
      or field not in ('member_document', 'signature_request')
      or entity_id = auth.uid()::text
      or public.agency_can('people.documents.manage')
      or public.agency_can('documents.manage')
    )
  );

comment on policy activity_events_select on public.activity_events is
  'Visibility, then the record, then (0294) the one field-level rule: a team member''s document events are readable by that person and by document-capability holders only.';
