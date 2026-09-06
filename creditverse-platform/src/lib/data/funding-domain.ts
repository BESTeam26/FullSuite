/**
 * FundingOps domain data — the funding FILE's application, document requests,
 * uploaded instances, flags, deals and lender decisions (migration 0058), plus
 * the lender catalogue with its policy versions.
 *
 * Shape rules (rule 14): one bounded batch per screen — `fetchFundingFileDomain`
 * runs its five reads in parallel and never per row; the catalogue is one
 * nested select. Every write that has to move two records at once goes through
 * a database function (dispositions, decisions); the rest are single inserts
 * the policies judge. Nothing here decides who may see what — RLS does.
 */
import type { FitSnapshot, ProgramFitOutcome } from "@/lib/funding/readiness-engine";
import { canMoveCommission, type CommissionBasis, type CommissionPartyKind, type CommissionState } from "@/lib/funding/commission-math";
import { recordPolicyUpdate, type PolicyChangeKind } from "@/lib/data/lender-relationship";
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Json, Tables, TablesUpdate } from "@/lib/supabase/database.types";
import { uploadAttachment } from "@/lib/data/activity-attachments";
import type { CatalogueLender } from "@/lib/funding/lender-catalogue";
import type { RequirementRule, ResolvedRequest } from "@/lib/funding/requirement-resolver";
import type { OutcomeDeal } from "@/lib/funding/lender-scorecard";
import type { QueueFile, RenewalSignal } from "@/lib/funding/action-queues";
import type { FundedSignal, OfferSignal, SubmissionSignal } from "@/lib/funding/dashboard-metrics";
import type { DocumentDisposition, LenderDecisionKind } from "@/lib/funding/document-vocabulary";

/* ------------------------------------------------------------------ */
/* Domain shapes (camelCase views of the rows)                          */
/* ------------------------------------------------------------------ */
export interface FundingApplication {
  id: string;
  fileId: string;
  version: number;
  source: string;
  submittedAt: string | null;
  requestedAmount: number | null;
  purpose: string | null;
  useOfFunds: string | null;
  productFamily: string | null;
  state: string | null;
  entityType: string | null;
  timeInBusinessMonths: number | null;
  monthlyRevenue: number | null;
  annualRevenue: number | null;
  creditScoreStated: number | null;
  existingDebtMonthly: number | null;
  scenario: Record<string, unknown>;
  createdAt: string;
}
export type ApplicationDraft = Omit<FundingApplication, "id" | "fileId" | "version" | "source" | "submittedAt" | "createdAt">;

export interface DocumentRequest {
  id: string;
  fileId: string;
  partyId: string | null;
  documentType: string;
  period: string | null;
  requirement: Enums<"document_requirement">;
  status: Enums<"document_request_status">;
  satisfiedByInstanceId: string | null;
  waivedReason: string | null;
  createdAt: string;
}
export interface DocumentInstance {
  id: string;
  fileId: string;
  requestId: string | null;
  storageFileId: string;
  fileName: string;
  sha256: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadSource: string;
  classifiedType: string | null;
  classifiedPeriod: string | null;
  disposition: DocumentDisposition;
  reviewedAt: string | null;
  reason: string | null;
  supersedesId: string | null;
  shareableWithLender: boolean;
  createdAt: string;
}
export interface DocumentFlag {
  id: string;
  fileId: string;
  instanceId: string | null;
  requestId: string | null;
  flagCode: Enums<"document_flag_code">;
  automatedStatus: Enums<"automated_review_status">;
  evidence: Record<string, unknown>;
  confidence: number | null;
  humanDisposition: Enums<"flag_human_disposition"> | null;
  reviewerReason: string | null;
  createdAt: string;
}
export interface LenderDecision {
  id: string;
  dealId: string;
  decision: LenderDecisionKind;
  decidedAt: string;
  terms: Record<string, unknown>;
  conditions: string | null;
  source: string;
  note: string | null;
}
export interface FileDeal {
  id: string;
  lender: string;
  lenderId: string | null;
  programId: string | null;
  program: string | null;
  amount: number;
  status: Enums<"funding_deal_status">;
  submittedAt: string | null;
  /** The Program Fit as it stood when this lender was chosen, never re-derived. */
  fitOutcome: ProgramFitOutcome | null;
  decisions: LenderDecision[];
}
export interface FundingParty { id: string; kind: Enums<"funding_party_kind">; displayName: string; ownershipPct: number | null }
export type OfferStatus = Enums<"offer_status">;
export type PricingType = Enums<"pricing_type">;
export type ClosingStatus = Enums<"closing_status">;
export type RenewalStatus = Enums<"renewal_status">;
export interface Offer {
  id: string; dealId: string; lenderId: string | null; receivedAt: string;
  offerAmount: number | null; pricingType: PricingType; pricingValue: number | null; termText: string | null; paymentFrequency: string | null;
  paymentAmount: number | null; originationFee: number | null; otherFees: { label: string; amount: number }[]; prepaymentTerms: string | null; expiresAt: string | null;
  status: OfferStatus; presentedAt: string | null; clientDecidedAt: string | null; note: string | null;
}
export interface Closing { id: string; offerId: string; status: ClosingStatus; startedAt: string; signedAt: string | null; note: string | null }
export interface FundedDeal {
  id: string; dealId: string; offerId: string | null; lenderName: string; requestedAmount: number; acceptedOfferAmount: number | null;
  grossFunded: number; netFunded: number; fundedAt: string; disbursementReference: string | null; confirmedAt: string; note: string | null;
}
export interface FileCommission {
  id: string; dealId: string; partyKind: CommissionPartyKind; partyId: string; basis: CommissionBasis; rateOrAmount: number; computedAmount: number | null;
  state: CommissionState; fundedAt: string | null; paidAt: string | null; note: string | null; createdAt: string;
}
export interface RenewalOpportunity { id: string; fundedDealId: string; potentialRenewalDate: string | null; status: RenewalStatus; nextFollowUpAt: string | null; newFileId: string | null; note: string | null }
export interface FundingFileDomain {
  /** The file's agency — uploads need it and an organization user's session does not carry it. */
  agencyId: string;
  stage: string;
  secondaryStatus: string;
  waitingOn: string;
  offers: Offer[];
  closings: Closing[];
  fundedDeals: FundedDeal[];
  commissions: FileCommission[];
  renewals: RenewalOpportunity[];
  clientId: string;
  parties: FundingParty[];
  /** Every active requirement rule the caller may see (small configuration table); the resolver filters by product. */
  rules: RequirementRule[];
  application: FundingApplication | null;
  requests: DocumentRequest[];
  instances: DocumentInstance[];
  /** Empty for anyone the policies do not treat as a reviewer. */
  flags: DocumentFlag[];
  deals: FileDeal[];
}

const obj = (j: Json | null | undefined): Record<string, unknown> => (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {});
const n = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

const mapApplication = (r: Tables<"funding_applications">): FundingApplication => ({
  id: r.id, fileId: r.file_id, version: r.version, source: r.source, submittedAt: r.submitted_at,
  requestedAmount: n(r.requested_amount), purpose: r.purpose, useOfFunds: r.use_of_funds, productFamily: r.product_family,
  state: r.state, entityType: r.entity_type, timeInBusinessMonths: r.time_in_business_months, monthlyRevenue: n(r.monthly_revenue),
  annualRevenue: n(r.annual_revenue), creditScoreStated: r.credit_score_stated, existingDebtMonthly: n(r.existing_debt_monthly),
  scenario: obj(r.scenario), createdAt: r.created_at,
});
const mapRequest = (r: Tables<"document_requests">): DocumentRequest => ({
  id: r.id, fileId: r.file_id, partyId: r.party_id, documentType: r.document_type, period: r.period, requirement: r.requirement,
  status: r.status, satisfiedByInstanceId: r.satisfied_by_instance_id, waivedReason: r.waived_reason, createdAt: r.created_at,
});
const mapFlag = (r: Tables<"document_flags">): DocumentFlag => ({
  id: r.id, fileId: r.file_id, instanceId: r.instance_id, requestId: r.request_id, flagCode: r.flag_code, automatedStatus: r.automated_status,
  evidence: obj(r.evidence), confidence: n(r.confidence), humanDisposition: r.human_disposition, reviewerReason: r.reviewer_reason, createdAt: r.created_at,
});
/* One reading of an offer and of a funded deal, shared by the file reader and
   the deal reader. Two copies of this mapping is two places for a currency to
   be read as a string (rule 6). */
const mapOffer = (o: Tables<"offers">): Offer => ({
  id: o.id, dealId: o.deal_id, lenderId: o.lender_id, receivedAt: o.received_at, offerAmount: n(o.offer_amount), pricingType: o.pricing_type, pricingValue: n(o.pricing_value),
  termText: o.term_text, paymentFrequency: o.payment_frequency, paymentAmount: n(o.payment_amount), originationFee: n(o.origination_fee),
  otherFees: Array.isArray(o.other_fees) ? (o.other_fees as { label: string; amount: number }[]) : [], prepaymentTerms: o.prepayment_terms, expiresAt: o.expires_at,
  status: o.status, presentedAt: o.presented_at, clientDecidedAt: o.client_decided_at, note: o.note,
});

const mapFundedDeal = (d: Tables<"funded_deals">): FundedDeal => ({
  id: d.id, dealId: d.deal_id, offerId: d.offer_id, lenderName: d.lender_name, requestedAmount: Number(d.requested_amount), acceptedOfferAmount: n(d.accepted_offer_amount),
  grossFunded: Number(d.gross_funded), netFunded: Number(d.net_funded), fundedAt: d.funded_at, disbursementReference: d.disbursement_reference, confirmedAt: d.confirmed_at, note: d.note,
});

const mapDecision = (r: Tables<"lender_decisions">): LenderDecision => ({
  id: r.id, dealId: r.deal_id, decision: r.decision, decidedAt: r.decided_at, terms: obj(r.terms), conditions: r.conditions, source: r.source, note: r.note,
});

/* ------------------------------------------------------------------ */
/* Reads                                                                */
/* ------------------------------------------------------------------ */
export async function fetchFundingFileDomain(fileId: string): Promise<FundingFileDomain> {
  const sb = requireSupabase();
  const [file, rules, app, requests, instances, flags, deals, offers, closings, funded, renewals, commissions] = await Promise.all([
    sb.from("funding_files").select("agency_id, client_id, stage, secondary_status, waiting_on, funding_clients(funding_parties(id, kind, display_name, ownership_pct))").eq("id", fileId).single(),
    sb.from("requirement_rules").select("*").eq("active", true),
    sb.from("funding_applications").select("*").eq("file_id", fileId).order("version", { ascending: false }).limit(1).maybeSingle(),
    /* deal_id IS NULL — file-level requirements only. A lender stipulation
       carries the same file_id but belongs to its deal, and letting one in
       here would both list it under the wrong heading and let it count
       towards the file's readiness (0112). */
    sb.from("document_requests").select("*").is("deal_id", null).eq("file_id", fileId).order("created_at", { ascending: true }),
    sb.from("document_instances").select("*, files(name)").eq("file_id", fileId).order("created_at", { ascending: false }),
    sb.from("document_flags").select("*").eq("file_id", fileId).order("created_at", { ascending: false }),
    sb.from("funding_deals").select("id, lender, lender_id, program_id, program, amount, status, submitted_at, fit_snapshot, lender_decisions(*)").eq("file_id", fileId).order("created_at", { ascending: false }),
    sb.from("offers").select("*").eq("file_id", fileId).order("received_at", { ascending: false }),
    sb.from("closings").select("*").eq("file_id", fileId).order("started_at", { ascending: false }),
    sb.from("funded_deals").select("*").eq("file_id", fileId).order("funded_at", { ascending: false }),
    sb.from("renewal_opportunities").select("*").eq("file_id", fileId).order("updated_at", { ascending: false }),
    sb.from("commissions").select("*, funding_deals!inner(file_id)").eq("funding_deals.file_id", fileId).order("created_at", { ascending: false }),
  ]);
  for (const r of [file, rules, app, requests, instances, flags, deals, offers, closings, funded, renewals, commissions]) if (r.error) throw r.error;
  const partyRows = ((file.data!.funding_clients as { funding_parties: Pick<Tables<"funding_parties">, "id" | "kind" | "display_name" | "ownership_pct">[] } | null)?.funding_parties) ?? [];
  return {
    agencyId: file.data!.agency_id,
    stage: file.data!.stage,
    secondaryStatus: file.data!.secondary_status,
    waitingOn: file.data!.waiting_on,
    offers: (offers.data ?? []).map(mapOffer),
    closings: (closings.data ?? []).map((c) => ({ id: c.id, offerId: c.offer_id, status: c.status, startedAt: c.started_at, signedAt: c.signed_at, note: c.note })),
    commissions: (commissions.data ?? []).map((c) => ({
      id: c.id, dealId: c.deal_id, partyKind: c.party_kind as CommissionPartyKind, partyId: c.party_id, basis: c.basis as CommissionBasis, rateOrAmount: Number(c.rate_or_amount), computedAmount: n(c.computed_amount),
      state: c.state as CommissionState, fundedAt: c.funded_at, paidAt: c.paid_at, note: c.note, createdAt: c.created_at,
    })),
    fundedDeals: (funded.data ?? []).map(mapFundedDeal),
    renewals: (renewals.data ?? []).map((r) => ({ id: r.id, fundedDealId: r.funded_deal_id, potentialRenewalDate: r.potential_renewal_date, status: r.status, nextFollowUpAt: r.next_follow_up_at, newFileId: r.new_file_id, note: r.note })),
    clientId: file.data!.client_id,
    parties: partyRows.map((p) => ({ id: p.id, kind: p.kind, displayName: p.display_name, ownershipPct: n(p.ownership_pct) })),
    rules: (rules.data ?? []).map((r) => ({
      id: r.id, version: r.version, active: r.active, productFamily: r.product_family, productSubtype: r.product_subtype, lenderId: r.lender_id, programId: r.program_id,
      partyKind: r.party_kind, documentType: r.document_type, requirement: r.requirement, condition: obj(r.condition), lookbackMonths: r.lookback_months,
      effectiveFrom: r.effective_from, effectiveUntil: r.effective_until,
    })),
    application: app.data ? mapApplication(app.data) : null,
    requests: (requests.data ?? []).map(mapRequest),
    instances: (instances.data ?? []).map((r) => ({
      id: r.id, fileId: r.file_id, requestId: r.request_id, storageFileId: r.storage_file_id,
      fileName: (r.files as { name: string } | null)?.name ?? "document", sha256: r.sha256, mimeType: r.mime_type, sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
      uploadSource: r.upload_source, classifiedType: r.classified_type, classifiedPeriod: r.classified_period, disposition: r.disposition,
      reviewedAt: r.reviewed_at, reason: r.reason, supersedesId: r.supersedes_id, shareableWithLender: r.shareable_with_lender, createdAt: r.created_at,
    })),
    flags: (flags.data ?? []).map(mapFlag),
    deals: (deals.data ?? []).map((d) => ({
      id: d.id, lender: d.lender, lenderId: d.lender_id, programId: d.program_id, program: d.program, amount: Number(d.amount), status: d.status, submittedAt: d.submitted_at,
      fitOutcome: (obj(d.fit_snapshot).outcome as ProgramFitOutcome | undefined) ?? null,
      decisions: ((d.lender_decisions ?? []) as Tables<"lender_decisions">[]).map(mapDecision).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    })),
  };
}

/** Every lender the caller may see, with programs and policy versions, in one request. */
export async function fetchLenderCatalogue(): Promise<CatalogueLender[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("lenders")
    .select("id, name, lender_kind, organization_id, active, lender_programs(id, name, product_family, product_subtype, states_allowed, active, lender_policy_versions(id, version, criteria, source_type, source_reference, source_published_date, effective_from, effective_until, last_verified_at))")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((l) => ({
    id: l.id, name: l.name, lenderKind: l.lender_kind, organizationId: l.organization_id, active: l.active,
    programs: (l.lender_programs ?? []).map((p) => ({
      id: p.id, name: p.name, productFamily: p.product_family, productSubtype: p.product_subtype, statesAllowed: p.states_allowed ?? [], active: p.active,
      policyVersions: (p.lender_policy_versions ?? []).map((v) => ({
        id: v.id, version: v.version, criteria: obj(v.criteria), sourceType: v.source_type, sourceReference: v.source_reference, sourcePublishedDate: v.source_published_date,
        effectiveFrom: v.effective_from, effectiveUntil: v.effective_until, lastVerifiedAt: v.last_verified_at,
      })),
    })),
  }));
}

/** Every submission the caller may see, with its decisions — the scorecard's input, one query. */
export async function fetchLenderOutcomes(): Promise<OutcomeDeal[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_deals")
    .select("id, lender, lender_id, amount, status, submitted_at, funded_at, lender_decisions(decision, decided_at)")
    .neq("status", "Draft")
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id, lenderId: d.lender_id, lenderName: d.lender, amount: Number(d.amount), status: d.status, submittedAt: d.submitted_at, fundedAt: d.funded_at,
    decisions: ((d.lender_decisions ?? []) as { decision: string; decided_at: string }[]).map((x) => ({ decision: x.decision, decidedAt: x.decided_at })),
  }));
}

/* ------------------------------------------------------------------ */
/* Lender catalogue writes — the policies decide who may (0058/0058.1) */
/* ------------------------------------------------------------------ */
export interface NewLender { organizationId: string; name: string; lenderKind: string; nmlsId: string | null; fdicCertificate: string | null; ncuaCharter: string | null; officialDomain: string | null; notes: string | null; actorId: string }
/** An organization's own catalogue entry. The agency is the organization's agency, read from the record — never supplied by the browser. */
export async function createLender(input: NewLender): Promise<string> {
  const sb = requireSupabase();
  const org = await sb.from("organizations").select("agency_id").eq("id", input.organizationId).single();
  if (org.error) throw org.error;
  const { data, error } = await sb.from("lenders").insert({
    agency_id: org.data.agency_id, organization_id: input.organizationId, name: input.name, lender_kind: input.lenderKind,
    nmls_id: input.nmlsId, fdic_certificate: input.fdicCertificate, ncua_charter: input.ncuaCharter, official_domain: input.officialDomain, notes: input.notes, created_by: input.actorId,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function createLenderProgram(input: { lenderId: string; name: string; productFamily: string; productSubtype: string | null; statesAllowed: string[] }): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("lender_programs").insert({ lender_id: input.lenderId, name: input.name, product_family: input.productFamily, product_subtype: input.productSubtype, states_allowed: input.statesAllowed }).select("id").single();
  if (error) throw error;
  return data.id;
}

export interface NewPolicyVersion {
  programId: string;
  version: number;
  criteria: Record<string, unknown>;    // min_amount, max_amount, min_credit_score, min_time_in_business_months, min_monthly_revenue, industries_excluded, strength{…}
  sourceType: string;
  sourceReference: string | null;
  sourcePublishedDate: string | null;   // yyyy-mm-dd
  effectiveFrom: string;                // yyyy-mm-dd
  verifiedNow: boolean;
  actorId: string;
  /** For v2+: what changed and how — becomes a policy-update feed row with the files it touches (0061). */
  change?: { fromVersion: number; kind: PolicyChangeKind; summary: string } | null;
}
/** A new version; the previous stays as the record of what was believed then. */
export async function createPolicyVersion(input: NewPolicyVersion): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("lender_policy_versions").insert({
    program_id: input.programId, version: input.version, criteria: input.criteria as Json, source_type: input.sourceType, source_reference: input.sourceReference,
    source_published_date: input.sourcePublishedDate, effective_from: input.effectiveFrom, created_by: input.actorId,
    last_verified_at: input.verifiedNow ? new Date().toISOString() : null, verified_by: input.verifiedNow ? input.actorId : null,
  });
  if (error) throw error;
  if (input.change) {
    await recordPolicyUpdate({ programId: input.programId, fromVersion: input.change.fromVersion, toVersion: input.version, changeKind: input.change.kind, summary: input.change.summary, actorId: input.actorId });
  }
}

/** Re-confirm a stored policy with the lender: only the verification stamp changes, never the criteria. */
export async function verifyPolicyVersion(programId: string, version: number, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("lender_policy_versions").update({ last_verified_at: new Date().toISOString(), verified_by: actorId }).eq("program_id", programId).eq("version", version);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Writes                                                               */
/* ------------------------------------------------------------------ */
/** A new application version; the previous stays as history. */
export async function saveApplication(fileId: string, draft: ApplicationDraft, previousVersion: number, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("funding_applications").insert({
    file_id: fileId, version: previousVersion + 1, source: "staff", created_by: actorId,
    requested_amount: draft.requestedAmount, purpose: draft.purpose, use_of_funds: draft.useOfFunds, product_family: draft.productFamily,
    state: draft.state, entity_type: draft.entityType, time_in_business_months: draft.timeInBusinessMonths, monthly_revenue: draft.monthlyRevenue,
    annual_revenue: draft.annualRevenue, credit_score_stated: draft.creditScoreStated, existing_debt_monthly: draft.existingDebtMonthly,
    scenario: draft.scenario as Json,
  });
  if (error) throw error;
}

export async function addDocumentRequest(input: { fileId: string; documentType: string; period: string | null; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("document_requests").insert({ file_id: input.fileId, document_type: input.documentType, period: input.period, created_by: input.actorId });
  if (error) throw error;
}

/** Open every request the resolver says is missing — one insert, never one per row (rule 14). */
export async function addResolvedRequests(fileId: string, resolved: ResolvedRequest[], actorId: string): Promise<number> {
  if (resolved.length === 0) return 0;
  const sb = requireSupabase();
  const { error } = await sb.from("document_requests").insert(resolved.map((r) => ({
    file_id: fileId, party_id: r.partyId, document_type: r.documentType, period: r.period, requirement: r.requirement,
    rule_id: r.ruleId, rule_version: r.ruleVersion, created_by: actorId,
  })));
  if (error) throw error;
  return resolved.length;
}

export async function waiveDocumentRequest(requestId: string, reason: string, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("document_requests").update({ status: "waived", waived_reason: reason, waived_by: actorId, waived_at: new Date().toISOString() }).eq("id", requestId);
  if (error) throw error;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Store an upload as an immutable instance: object in the private bucket,
 * `files` row, `document_instances` row. If the same bytes already exist on
 * this file, the instance is still kept (the reviewer decides) and a
 * DUPLICATE_DOCUMENT flag records the evidence — a duplicate is a potential
 * issue, not a verdict.
 */
export async function uploadDocumentInstance(input: {
  file: File;
  fileId: string;
  agencyId: string;
  organizationId: string | null;
  actorId: string;
  requestId: string | null;
  classifiedType: string | null;
  classifiedPeriod: string | null;
  /** 'portal' when the borrower uploads; the insert policy then requires disposition pending_review. */
  uploadSource?: "staff" | "portal";
}): Promise<void> {
  const sb = requireSupabase();
  const sha256 = await sha256Hex(input.file);
  const [dupes, object] = await Promise.all([
    sb.from("document_instances").select("id").eq("file_id", input.fileId).eq("sha256", sha256),
    uploadAttachment({ file: input.file, entityType: "funding_file", entityId: input.fileId, organizationId: input.organizationId ?? undefined, visibility: input.organizationId ? "organization_internal" : "bes_internal" }),
  ]);
  if (dupes.error) throw dupes.error;

  const fileRow = await sb.from("files").insert({
    agency_id: input.agencyId, organization_id: input.organizationId, entity_type: "funding_file", entity_id: input.fileId,
    bucket: "bes-files", path: object.path, name: object.name, mime_type: object.mimeType, size_bytes: object.sizeBytes, sha256, uploaded_by: input.actorId,
  }).select("id").single();
  if (fileRow.error) throw fileRow.error;

  const instance = await sb.from("document_instances").insert({
    file_id: input.fileId, request_id: input.requestId, storage_file_id: fileRow.data.id, sha256, mime_type: object.mimeType, size_bytes: object.sizeBytes,
    uploaded_by: input.actorId, upload_source: input.uploadSource ?? "staff", classified_type: input.classifiedType, classified_period: input.classifiedPeriod,
  }).select("id").single();
  if (instance.error) throw instance.error;

  if ((dupes.data ?? []).length > 0) {
    const { error } = await sb.from("document_flags").insert({
      file_id: input.fileId, instance_id: instance.data.id, flag_code: "DUPLICATE_DOCUMENT", automated_status: "potential_discrepancy",
      evidence: { duplicate_of: dupes.data!.map((d) => d.id), sha256 } as Json, rule_id: "DOC.DUPLICATE_HASH", rule_version: "1", confidence: 1, created_by: input.actorId,
    });
    if (error) throw error;
  }
}

export async function recordDocumentDisposition(instanceId: string, disposition: DocumentDisposition, reason: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("record_document_disposition", { p_instance: instanceId, p_disposition: disposition, p_reason: reason ?? undefined });
  if (error) throw error;
}

export async function resolveDocumentFlag(flagId: string, humanDisposition: Enums<"flag_human_disposition">, reason: string | null, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("document_flags").update({ human_disposition: humanDisposition, reviewer_reason: reason, reviewer: actorId, reviewed_at: new Date().toISOString() }).eq("id", flagId);
  if (error) throw error;
}

/** A submission to a lender program is a deal in status Submitted, naming the program it was matched on. */
/** A submission records which policy version it was judged against and the Program Fit at that moment (0061) — the outcome later reads against that, not against today's policy. */
/**
 * Select a lender to pursue — a DEAL, not yet a submission.
 *
 * Dee, 2026-09-06: *"Do not create Deals merely because a lender appeared in
 * search results. A Deal becomes real when the team intentionally decides to
 * pursue that lender/program."*
 *
 * So selecting writes a `Draft` deal and nothing else: no `submitted_at`, no
 * claim that a lender has seen anything. The fit snapshot and the policy
 * version are captured HERE, at the moment of the decision, because that is
 * what the team judged — a policy that changes between selection and
 * submission must not silently rewrite why the lender was chosen (rule 4).
 */
export async function selectLender(input: { fileId: string; clientId: string; lenderId: string; lenderName: string; programId: string; programName: string; amount: number; policyVersionId: string | null; fitSnapshot: FitSnapshot | null }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("funding_deals").insert({
    file_id: input.fileId, client_id: input.clientId, lender: input.lenderName, lender_id: input.lenderId, program_id: input.programId, program: input.programName,
    amount: input.amount, status: "Draft",
    policy_version_id: input.policyVersionId, fit_snapshot: input.fitSnapshot ? (input.fitSnapshot as unknown as Json) : null,
  });
  if (error) throw error;
}

/**
 * Submit a selected deal. Draft → Submitted, stamping when it went out.
 *
 * Guarded on `status = 'Draft'` in the WHERE clause rather than read-then-
 * write: two people pressing Submit at the same moment must not produce two
 * submission timestamps, and the second update simply matches no row.
 */
export async function submitSelectedDeal(dealId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("funding_deals")
    .update({ status: "Submitted", submitted_at: new Date().toISOString() })
    .eq("id", dealId)
    .eq("status", "Draft");
  if (error) throw error;
}

/**
 * Un-select a lender that was chosen and not yet submitted.
 *
 * Only a Draft may go: once a deal has been submitted, a lender has seen the
 * file and the record is history (rule 11). Withdrawing a live deal is a
 * lender decision, recorded through `record_lender_decision`, not a delete.
 */
export async function unselectLender(dealId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("funding_deals").delete().eq("id", dealId).eq("status", "Draft");
  if (error) throw error;
}

export async function recordLenderDecision(input: { dealId: string; decision: LenderDecisionKind; terms: Record<string, unknown>; conditions: string | null; note: string | null }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("record_lender_decision", {
    p_deal: input.dealId, p_decision: input.decision, p_terms: input.terms as Json, p_conditions: input.conditions ?? undefined, p_note: input.note ?? undefined,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Pipeline axes, offers, closing, funding, renewals — explicit actions  */
/* ------------------------------------------------------------------ */
export async function moveFundingFile(input: { fileId: string; stage?: Enums<"funding_pipeline_stage">; secondary?: Enums<"funding_secondary_status">; waitingOn?: Enums<"funding_waiting_on">; note?: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("move_funding_file", { p_file: input.fileId, p_stage: input.stage, p_secondary: input.secondary, p_waiting_on: input.waitingOn, p_note: input.note });
  if (error) throw error;
}

export interface NewOffer {
  fileId: string; dealId: string; lenderId: string | null; offerAmount: number | null; pricingType: PricingType; pricingValue: number | null; termText: string | null;
  paymentFrequency: string | null; paymentAmount: number | null; originationFee: number | null; prepaymentTerms: string | null; expiresAt: string | null; note: string | null; actorId: string;
}
/** Raw lender terms exactly as provided; calculated values live in code, never stored as if the lender said them. */
export async function createOffer(input: NewOffer): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("offers").insert({
    file_id: input.fileId, deal_id: input.dealId, lender_id: input.lenderId, offer_amount: input.offerAmount, pricing_type: input.pricingType, pricing_value: input.pricingValue,
    term_text: input.termText, payment_frequency: input.paymentFrequency, payment_amount: input.paymentAmount, origination_fee: input.originationFee, prepayment_terms: input.prepaymentTerms,
    expires_at: input.expiresAt, note: input.note, created_by: input.actorId,
  });
  if (error) throw error;
}
export async function setOfferStatus(offerId: string, status: OfferStatus, note?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_offer_status", { p_offer: offerId, p_status: status, p_note: note });
  if (error) throw error;
}
export async function startClosing(offerId: string, note?: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("start_closing", { p_offer: offerId, p_note: note });
  if (error) throw error;
  return data as string;
}
export async function advanceClosing(closingId: string, status: ClosingStatus, note?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("advance_closing", { p_closing: closingId, p_status: status, p_note: note });
  if (error) throw error;
}
/** The only action that creates a funded deal. */
export async function confirmFunding(input: { closingId: string; gross: number; net: number; fundedAt: string; reference?: string; note?: string }): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("confirm_funding", { p_closing: input.closingId, p_gross: input.gross, p_net: input.net, p_funded_at: input.fundedAt, p_reference: input.reference, p_note: input.note });
  if (error) throw error;
  return data as string;
}
/** A commission row on a funded deal; the amount arrives computed by lib/funding/commission-math.ts. Policy: reviewers of the file. */
export async function createCommission(input: { dealId: string; partyKind: CommissionPartyKind; partyId: string; basis: CommissionBasis; rateOrAmount: number; computedAmount: number; fundedAt: string; note: string | null; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("commissions").insert({ deal_id: input.dealId, party_kind: input.partyKind, party_id: input.partyId, basis: input.basis, rate_or_amount: input.rateOrAmount, computed_amount: input.computedAmount, funded_at: input.fundedAt, note: input.note, created_by: input.actorId });
  if (error) throw error;
}
/** pending → approved → paid | void; the machine lives in commission-math.ts and is checked here before the write. */
export async function setCommissionState(commissionId: string, to: CommissionState): Promise<void> {
  const sb = requireSupabase();
  const current = await sb.from("commissions").select("state").eq("id", commissionId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("Commission not visible.");
  if (!canMoveCommission(current.data.state as CommissionState, to)) throw new Error(`A commission cannot go from ${current.data.state} to ${to}.`);
  const { data, error } = await sb.from("commissions").update({ state: to, paid_at: to === "paid" ? new Date().toISOString() : null }).eq("id", commissionId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this commission.");
}

export async function createRenewalFile(renewalId: string, purpose: string, requestedAmount: number): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("create_renewal_file", { p_renewal: renewalId, p_purpose: purpose, p_requested_amount: requestedAmount });
  if (error) throw error;
  return data as string;
}
export async function updateRenewal(renewalId: string, patch: { status?: RenewalStatus; nextFollowUpAt?: string | null; potentialRenewalDate?: string | null; note?: string | null }, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = { updated_by: actorId };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.nextFollowUpAt !== undefined) row.next_follow_up_at = patch.nextFollowUpAt;
  if (patch.potentialRenewalDate !== undefined) row.potential_renewal_date = patch.potentialRenewalDate;
  if (patch.note !== undefined) row.note = patch.note;
  const { data, error } = await sb.from("renewal_opportunities").update(row as TablesUpdate<"renewal_opportunities">).eq("id", renewalId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this renewal.");
}

/* ------------------------------------------------------------------ */
/* Dashboard signals — bounded, org-scoped by RLS, no per-file requests  */
/* ------------------------------------------------------------------ */
const assigneeName = (p: { full_name: string | null; email: string } | null): string | null => (p ? p.full_name?.trim() || p.email : null);

export interface QueueSignals {
  files: QueueFile[];
  renewals: RenewalSignal[];
  fileNames: Record<string, string>;
  offers: OfferSignal[];
  funded: FundedSignal[];
  submissions: SubmissionSignal[];
}
export async function fetchFundingQueueSignals(): Promise<QueueSignals> {
  const sb = requireSupabase();
  const [files, requests, offers, closings, renewals, funded, deals] = await Promise.all([
    sb.from("funding_files").select("id, stage, secondary_status, waiting_on, last_activity_at, assigned_agent_id, purpose, public_id, requested_amount, funding_clients(name), funding_businesses(legal_name), assignee:profiles!assigned_agent_id(full_name, email)").limit(2000),
    /* Outstanding is more than `open` now that a requirement has a lifecycle:
       assigned, waiting on the client and under review are all still work to
       do. Only satisfied and waived are finished (0112). */
    sb.from("document_requests").select("file_id").not("status", "in", "(satisfied,waived)").limit(5000),
    sb.from("offers").select("file_id, status, offer_amount").limit(3000),
    sb.from("closings").select("file_id, status").not("status", "in", "(funded,cancelled)").limit(2000),
    sb.from("renewal_opportunities").select("status, potential_renewal_date, next_follow_up_at, new_file_id").limit(2000),
    sb.from("funded_deals").select("gross_funded, funded_at").limit(3000),
    sb.from("funding_deals").select("file_id, lender, status").neq("status", "Draft").limit(3000),
  ]);
  for (const r of [files, requests, offers, closings, renewals, funded, deals]) if (r.error) throw r.error;
  const openReq = new Map<string, number>(); for (const r of requests.data ?? []) openReq.set(r.file_id, (openReq.get(r.file_id) ?? 0) + 1);
  const offerReview = new Map<string, number>(); for (const o of offers.data ?? []) if (o.status === "received" || o.status === "internal_review") offerReview.set(o.file_id, (offerReview.get(o.file_id) ?? 0) + 1);
  const closing = new Map<string, string>(); for (const c of closings.data ?? []) closing.set(c.file_id, c.status);
  const fileNames: Record<string, string> = {};
  const out: QueueFile[] = (files.data ?? []).map((f) => {
    const client = (f.funding_clients as { name: string } | null)?.name;
    const biz = (f.funding_businesses as { legal_name: string } | null)?.legal_name;
    fileNames[f.id] = `${client ?? biz ?? "File"}${client && biz ? ` · ${biz}` : ""} · ${f.purpose} · ${f.public_id}`;
    return {
      id: f.id, stage: f.stage as QueueFile["stage"], secondaryStatus: f.secondary_status as QueueFile["secondaryStatus"], waitingOn: f.waiting_on as QueueFile["waitingOn"],
      lastActivityAt: f.last_activity_at, assignedAgentId: f.assigned_agent_id, assignedAgentName: assigneeName(f.assignee as { full_name: string | null; email: string } | null), openRequests: openReq.get(f.id) ?? 0, offersAwaitingReview: offerReview.get(f.id) ?? 0, closingStatus: closing.get(f.id) ?? null,
      requestedAmount: Number(f.requested_amount ?? 0),
    };
  });
  return {
    files: out,
    renewals: (renewals.data ?? []).map((r) => ({ status: r.status, potentialRenewalDate: r.potential_renewal_date, nextFollowUpAt: r.next_follow_up_at, newFileId: r.new_file_id })),
    fileNames,
    offers: (offers.data ?? []).map((o) => ({ fileId: o.file_id, status: o.status, amount: o.offer_amount === null ? null : Number(o.offer_amount) })),
    funded: (funded.data ?? []).map((f) => ({ gross: Number(f.gross_funded), fundedAt: f.funded_at })),
    submissions: (deals.data ?? []).map((d) => ({ fileId: d.file_id, lender: d.lender, status: d.status })),
  };
}

/* ------------------------------------------------------------------ */
/* One DEAL — the record of taking this file to one lender             */
/* ------------------------------------------------------------------ */

export interface DealStipulation {
  id: string;
  documentType: string;
  period: string | null;
  status: Enums<"document_request_status">;
  lenderNote: string | null;
  assignedTo: string | null;
  waivedReason: string | null;
  satisfiedByInstanceId: string | null;
  createdAt: string;
}

export interface DealDetail {
  id: string;
  fileId: string;
  filePublicId: string | null;
  clientId: string;
  clientName: string | null;
  businessName: string | null;
  lender: string;
  lenderId: string | null;
  program: string | null;
  programId: string | null;
  amount: number;
  status: Enums<"funding_deal_status">;
  submittedAt: string | null;
  fundedAt: string | null;
  rate: string | null;
  term: string | null;
  /** Program Fit as it stood when this lender was chosen. Never re-derived. */
  fitOutcome: ProgramFitOutcome | null;
  fitCriteria: { key: string; result: string; reason: string }[];
  policyVersionId: string | null;
  decisions: LenderDecision[];
  stipulations: DealStipulation[];
  offers: Offer[];
  funded: FundedDeal | null;
}

/**
 * One deal, in one bounded request.
 *
 * The nesting is the canonical chain read downward from the deal: its file
 * (for the reference and the borrower), its lender decisions, its
 * stipulations, its offers, and the funded record if one exists. A deal page
 * that fetched each of those separately would be five round trips for one
 * screen (rule 14).
 */
export async function fetchDealDetail(dealId: string): Promise<DealDetail | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("funding_deals")
    .select(`
      id, file_id, client_id, lender, lender_id, program, program_id, amount, status,
      submitted_at, funded_at, rate, term, fit_snapshot, policy_version_id,
      funding_files(public_id, funding_businesses(legal_name, dba)),
      funding_clients(name),
      lender_decisions(*),
      document_requests(id, document_type, period, status, lender_note, assigned_to, waived_reason, satisfied_by_instance_id, created_at),
      offers(*),
      funded_deals(*)
    `)
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Tables<"funding_deals"> & {
    funding_files: { public_id: string | null; funding_businesses: { legal_name: string; dba: string | null } | null } | null;
    funding_clients: { name: string } | null;
    lender_decisions: Tables<"lender_decisions">[] | null;
    document_requests: Tables<"document_requests">[] | null;
    offers: Tables<"offers">[] | null;
    funded_deals: Tables<"funded_deals">[] | null;
  };
  const snapshot = obj(r.fit_snapshot);
  const business = r.funding_files?.funding_businesses ?? null;
  const fundedRow = (r.funded_deals ?? [])[0] ?? null;
  return {
    id: r.id,
    fileId: r.file_id,
    filePublicId: r.funding_files?.public_id ?? null,
    clientId: r.client_id,
    clientName: r.funding_clients?.name ?? null,
    businessName: business ? business.dba?.trim() || business.legal_name : null,
    lender: r.lender,
    lenderId: r.lender_id,
    program: r.program,
    programId: r.program_id,
    amount: Number(r.amount),
    status: r.status,
    submittedAt: r.submitted_at,
    fundedAt: r.funded_at,
    rate: r.rate,
    term: r.term,
    fitOutcome: (snapshot.outcome as ProgramFitOutcome | undefined) ?? null,
    fitCriteria: Array.isArray(snapshot.criteria)
      ? (snapshot.criteria as { key: string; result: string; reason: string }[])
      : [],
    policyVersionId: r.policy_version_id,
    decisions: (r.lender_decisions ?? []).map(mapDecision).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    stipulations: (r.document_requests ?? []).map((s) => ({
      id: s.id,
      documentType: s.document_type,
      period: s.period,
      status: s.status,
      lenderNote: s.lender_note,
      assignedTo: s.assigned_to,
      waivedReason: s.waived_reason,
      satisfiedByInstanceId: s.satisfied_by_instance_id,
      createdAt: s.created_at,
    })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    offers: (r.offers ?? []).map(mapOffer).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    funded: fundedRow ? mapFundedDeal(fundedRow) : null,
  };
}

/** Record what a lender asked for. Only a submitted deal may have one. */
export async function addDealStipulation(input: {
  dealId: string;
  documentType: string;
  lenderNote?: string | null;
  period?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("add_deal_stipulation", {
    p_deal: input.dealId,
    p_document_type: input.documentType,
    p_lender_note: input.lenderNote ?? undefined,
    p_period: input.period ?? undefined,
  });
  if (error) throw error;
}

/** Move a requirement or stipulation along its lifecycle. */
export async function moveDocumentRequest(
  requestId: string,
  status: Enums<"document_request_status">,
  note?: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("move_document_request", {
    p_request: requestId,
    p_status: status,
    p_note: note ?? undefined,
  });
  if (error) throw error;
}
