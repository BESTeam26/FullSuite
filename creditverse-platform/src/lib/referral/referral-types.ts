// BES Referral & Lead-Engine Domain Model
// One Person can move through multiple services without losing the original
// referral source or creating duplicate identities. Referral attribution,
// DIY enrollment, subscription, lead/opportunity, and commission are kept
// as SEPARATE records.

export type PartnerType =
  "creditops" | "fundingops" | "full-suite" | "affiliate" | "bes-direct";

export type DiyStatus = "trial" | "active" | "paused" | "canceled" | "churned";

export type SubscriptionStatus =
  "none" | "trialing" | "active" | "past_due" | "canceled";

export type ServiceInterest =
  "none" | "professional_credit" | "business_funding" | "both";

export type LeadStage =
  "new" | "contacted" | "qualified" | "opportunity" | "converted" | "lost";

export type LeadType =
  | "diy_signup"
  | "professional_help_request"
  | "funding_request"
  | "funding_readiness_reassessment";

export type CommissionState =
  "pending" | "eligible" | "approved" | "paid" | "reversed";

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  referralCode: string;
  referralLink: string;
  offersCredit: boolean;
  offersFunding: boolean;
}

export interface ReferralAttribution {
  personId: string;
  partnerId: string; // "bes-direct" when no partner
  partnerType: PartnerType;
  referralCode: string;
  referralLink: string;
  firstReferralDate: string;
  source: "BES DIY Credit" | "Direct" | "Partner";
  // Preserved even if the consumer later purchases another service.
  original: boolean;
}

export interface DiyEnrollment {
  personId: string;
  status: DiyStatus;
  signupDate: string;
  serviceInterest: ServiceInterest;
  progressPct: number;
}

export interface Subscription {
  personId: string;
  status: SubscriptionStatus;
  plan: string;
  amount: number;
  startedDate: string;
}

export interface LeadOpportunity {
  id: string;
  personId: string;
  type: LeadType;
  stage: LeadStage;
  createdDate: string;
  partnerId: string; // routed back to original referring partner if eligible
  serviceInterest: ServiceInterest;
  note: string;
}

export interface CommissionRecord {
  id: string;
  personId: string;
  partnerId: string;
  state: CommissionState;
  amount: number;
  createdDate: string;
  paidDate?: string;
  ruleId: string;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  phone?: string;
  // Attribution is a separate record, but we keep a denormalized pointer for UI.
  attribution: ReferralAttribution;
  enrollment: DiyEnrollment;
  subscription: Subscription;
  fundingInterest: boolean;
  professionalHelpInterest: boolean;
}

export interface CommissionRule {
  id: string;
  name: string;
  trigger:
    | "diy_signup"
    | "diy_conversion"
    | "professional_conversion"
    | "funding_conversion";
  type: "percent" | "flat";
  value: number;
  delayDays: number; // configurable waiting period
  active: boolean;
}
